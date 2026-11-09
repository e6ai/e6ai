# frozen_string_literal: true

require "rails_helper"

RSpec.describe Maintenance::User::DataExportsController do
  include_context "as admin"

  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  # Bypasses the public-set age check and per-hour limits; tests only care about stored values.
  def make_set(creator, **attrs)
    set = create(:post_set, creator: creator)
    set.update_columns(**attrs) if attrs.any?
    set.reload
  end

  def export_json
    get maintenance_user_data_export_path
    expect(response).to have_http_status(:ok)
    response.parsed_body
  end

  describe "GET /maintenance/user/data_export" do
    context "when anonymous" do
      it "redirects to the login page" do
        get maintenance_user_data_export_path
        expect(response).to redirect_to(new_session_path(url: maintenance_user_data_export_path))
      end

      it "returns 403 with no data for JSON requests" do
        get maintenance_user_data_export_path(format: :json)
        expect(response).to have_http_status(:forbidden)
        expect(response.parsed_body).not_to have_key("favorites")
      end
    end

    context "when logged in" do
      before { sign_in_as(user) }

      it "returns the export as a non-cacheable JSON attachment" do
        get maintenance_user_data_export_path
        expect(response).to have_http_status(:ok)
        expect(response.media_type).to eq("application/json")
        expect(response.headers["Content-Disposition"]).to start_with("attachment")
        expect(response.headers["Content-Disposition"]).to include("user-data-#{user.name}-")
        expect(response.headers["Content-Disposition"]).to include('.json"')
        expect(response.headers["Cache-Control"]).to eq("no-store")
      end

      it "returns valid JSON with empty collections for a user with no data" do
        json = export_json
        expect(json.keys).to eq(%w[format_version exported_at favorites favorited_at sets])
        expect(json["format_version"]).to eq(1)
        expect(json["exported_at"]).to match(/\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\z/)
        expect(json["favorites"]).to eq([])
        expect(json["favorited_at"]).to eq({})
        expect(json["sets"]).to eq({})
      end

      it "includes favorites even with privacy mode on" do
        user.update_columns(bit_prefs: user.bit_prefs | User.flag_value_for("enable_privacy_mode"))
        post = create(:post)
        FavoriteManager.add!(user: user, post: post)

        expect(export_json["favorites"]).to eq([post.id])
      end

      it "orders favorites by when they were favorited, not by post ID or favorite ID" do
        low, mid, high = create_list(:post, 3).sort_by(&:id)
        # Rows are inserted in post ID order, but favorited in the order high, low, mid.
        Favorite.insert_all!([
          { user_id: user.id, post_id: low.id, created_at: Time.utc(2025, 6, 1) },
          { user_id: user.id, post_id: mid.id, created_at: Time.utc(2025, 9, 1) },
          { user_id: user.id, post_id: high.id, created_at: Time.utc(2024, 1, 1) },
        ])

        json = export_json
        expect(json["favorites"]).to eq([high.id, low.id, mid.id])
        expect(json["favorited_at"]).to eq(
          high.id.to_s => "2024-01-01T00:00:00Z",
          low.id.to_s => "2025-06-01T00:00:00Z",
          mid.id.to_s => "2025-09-01T00:00:00Z",
        )
      end

      it "excludes other users' favorites" do
        mine, theirs = create_list(:post, 2)
        FavoriteManager.add!(user: user, post: mine)
        FavoriteManager.add!(user: other_user, post: theirs)

        expect(export_json["favorites"]).to eq([mine.id])
      end

      it "includes private and public owned sets with their metadata and post order" do
        private_set = make_set(
          user,
          name: "My Private Set",
          shortname: "my_private_set",
          description: "Some [b]dtext[/b]",
          post_ids: [30, 10, 20],
          created_at: Time.utc(2026, 1, 1, 12, 0, 0),
          updated_at: Time.utc(2026, 2, 1, 12, 0, 0),
        )
        public_set = make_set(user, is_public: true, transfer_on_delete: true, post_ids: [500, 7, 42, 3, 99])

        sets = export_json["sets"]
        expect(sets.keys).to eq([private_set.id.to_s, public_set.id.to_s])
        expect(sets[private_set.id.to_s]).to eq(
          "name" => "My Private Set",
          "short_name" => "my_private_set",
          "description" => "Some [b]dtext[/b]",
          "created_at" => "2026-01-01T12:00:00Z",
          "updated_at" => "2026-02-01T12:00:00Z",
          "is_public" => false,
          "transfer_on_delete" => false,
          "post_ids" => [30, 10, 20],
        )
        expect(sets[public_set.id.to_s]).to include("is_public" => true, "transfer_on_delete" => true, "post_ids" => [500, 7, 42, 3, 99])
      end

      it "excludes sets owned by other users, including ones the user maintains" do
        make_set(other_user)
        maintained = make_set(other_user, is_public: true)
        create(:approved_post_set_maintainer, post_set: maintained, user: user)

        expect(export_json["sets"]).to eq({})
      end

      it "ignores attempts to export another user's data" do
        FavoriteManager.add!(user: other_user, post: create(:post))
        make_set(other_user)

        get maintenance_user_data_export_path, params: { user_id: other_user.id, id: other_user.id }
        expect(response.parsed_body["favorites"]).to eq([])
        expect(response.parsed_body["sets"]).to eq({})
      end

      it "does not truncate large exports" do
        template = create(:post).attributes.except("id", "md5", "change_seq")
        rows = Array.new(1_000) { |i| template.merge("md5" => Digest::MD5.hexdigest("export-#{i}")) }
        post_ids = Post.insert_all!(rows, returning: :id).rows.flatten
        Favorite.insert_all!(post_ids.map { |id| { user_id: user.id, post_id: id } })

        big_set_ids = (1..PostSet.new.max_posts).to_a.shuffle(random: Random.new(1))
        big_set = make_set(user, post_ids: big_set_ids)

        json = export_json
        expect(json["favorites"]).to eq(post_ids)
        expect(json["favorited_at"].size).to eq(1_000)
        expect(json["sets"][big_set.id.to_s]["post_ids"]).to eq(big_set_ids)
      end
    end

    context "when logged in as a moderator" do
      before { sign_in_as(create(:moderator_user)) }

      it "only exports the moderator's own sets" do
        make_set(other_user)
        expect(export_json["sets"]).to eq({})
      end
    end
  end
end
