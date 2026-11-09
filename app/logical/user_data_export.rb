# frozen_string_literal: true

# Builds a portable JSON export of a user's favorites and owned post sets,
# so they can be restored on another e621ng-based site.
#
# Format (version 1):
#   favorites:    post IDs in the order they were favorited, oldest first
#   favorited_at: when each of those posts was favorited, keyed by post ID (as a string)
#   sets:         owned sets keyed by set ID (as a string), ordered by ID;
#                 post_ids are exactly as stored, so the set's own order is kept
#
# Only plucks columns, so no Post or PostSet records are instantiated.
class UserDataExport
  FORMAT_VERSION = 1

  SET_COLUMNS = %i[id name shortname description is_public transfer_on_delete created_at updated_at post_ids].freeze

  def initialize(user)
    @user = user
  end

  def as_json(*)
    favorites = favorite_rows
    {
      format_version: FORMAT_VERSION,
      exported_at: format_time(Time.current),
      favorites: favorites.map(&:first),
      favorited_at: favorites.to_h { |post_id, created_at| [post_id.to_s, format_time(created_at)] },
      sets: sets,
    }
  end

  def to_json(*)
    as_json.to_json
  end

  def filename
    name = @user.name.gsub(/[^\w-]/, "_")
    "#{Danbooru.config.app_name.parameterize}-user-data-#{name}-#{Time.current.utc.to_date.iso8601}.json"
  end

  private

  # favorites.created_at is when the post was favorited; the favorite ID breaks ties.
  def favorite_rows
    Favorite.where(user_id: @user.id).order(:created_at, :id).pluck(:post_id, :created_at)
  end

  def sets
    PostSet.where(creator_id: @user.id).order(:id).pluck(*SET_COLUMNS).to_h do |row|
      set = SET_COLUMNS.zip(row).to_h
      data = {
        name: set[:name],
        short_name: set[:shortname],
        description: set[:description],
        created_at: format_time(set[:created_at]),
        updated_at: format_time(set[:updated_at]),
        is_public: set[:is_public],
        transfer_on_delete: set[:transfer_on_delete],
        post_ids: set[:post_ids],
      }
      [set[:id].to_s, data]
    end
  end

  def format_time(time)
    time&.utc&.iso8601
  end
end
