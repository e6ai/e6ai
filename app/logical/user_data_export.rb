# frozen_string_literal: true

# Builds a portable JSON export of a user's profile, favorites and owned
# post sets, so they can be restored on another e621ng-based site.
#
# Format (version 1):
#   profile:   the user's about text, artist/director info, and avatar
#              (post ID and whether a crop was applied; crop coordinates aren't stored)
#   favorites: when each post was favorited, keyed by post ID (as a string).
#              Entries are written oldest first, but JSON object order isn't
#              guaranteed to survive parsing (JavaScript reorders integer-like
#              keys), so consumers must sort by the timestamp value instead.
#   sets:      owned sets keyed by set ID (as a string), ordered by ID;
#              post_ids are exactly as stored, so the set's own order is kept
#
# Only plucks columns, so no Post or PostSet records are instantiated.
class UserDataExport
  FORMAT_VERSION = 1

  SET_COLUMNS = %i[id name shortname description is_public transfer_on_delete created_at updated_at post_ids].freeze

  def initialize(user)
    @user = user
  end

  def as_json(*)
    {
      format_version: FORMAT_VERSION,
      exported_at: format_time(Time.current),
      profile: profile,
      favorites: favorites,
      sets: sets,
    }
  end

  def filename
    name = @user.name.gsub(/[^\w-]/, "_")
    "#{Danbooru.config.app_name.parameterize}-user-data-#{name}-#{Time.current.utc.to_date.iso8601}.json"
  end

  private

  def profile
    {
      about: @user.profile_about,
      artinfo: @user.profile_artinfo,
      avatar: avatar,
    }
  end

  # Only the source post and whether it was cropped are stored; the crop
  # coordinates are used to render the avatar image and then discarded.
  def avatar
    return nil if @user.avatar_id.blank?
    { post_id: @user.avatar_id, cropped: @user.has_cropped_avatar? }
  end

  # favorites.created_at is when the post was favorited; the favorite ID breaks ties.
  def favorites
    Favorite.for_user(@user.id).order(:created_at, :id).pluck(:post_id, :created_at).to_h do |post_id, created_at|
      [post_id.to_s, format_time(created_at)]
    end
  end

  def sets
    PostSet.owned(@user).order(:id).pluck(*SET_COLUMNS).to_h do |row|
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
