# frozen_string_literal: true

require "test_helper"

class TagSetPresenterTest < ActiveSupport::TestCase
  context "TagSetPresenter" do
    setup do
      CurrentUser.user = create(:mod_user)
      create(:tag, name: "bkub", category: Tag.categories.director)
      create(:tag, name: "chen", category: Tag.categories.character)
      create(:tag, name: "cirno", category: Tag.categories.character)
      create(:tag, name: "solo", category: Tag.categories.general)
    end

    context "#split_tag_list_text method" do
      should "list all categories in order" do
        text = TagSetPresenter.new(%w[bkub chen cirno solo]).split_tag_list_text
        assert_equal("bkub \nchen cirno \nsolo", text)
      end

      should "skip empty categories" do
        text = TagSetPresenter.new(%w[bkub solo]).split_tag_list_text
        assert_equal("bkub \nsolo", text)
      end
    end
  end
end
