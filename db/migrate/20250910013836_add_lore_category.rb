# frozen_string_literal: true

class AddLoreCategory < ActiveRecord::Migration[7.1]
  def change
    Post.without_timeout do
      add_column(:posts, :tag_count_lore, :integer, default: 0, null: false)
    end
  end
end
