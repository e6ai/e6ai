# frozen_string_literal: true

class ForumPostVotesController < ApplicationController
  respond_to :json
  before_action :member_only
  before_action :load_forum_post
  before_action :validate_forum_post
  before_action :validate_no_vote_on_own_post, only: [:create]
  before_action :load_vote, only: [:destroy]
  before_action :ensure_lockdown_disabled

  def create
    @forum_post_vote = @forum_post.votes.create(forum_post_vote_params)
    raise User::PrivilegeError, @forum_post_vote.errors.full_messages.join("; ") unless @forum_post_vote.errors.empty?
    respond_with(@forum_post_vote) do |fmt|
      fmt.json { render json: @forum_post_vote, code: 201 }
    end
  end

  def destroy
    @forum_post_vote.destroy
    respond_with(@forum_post_vote) do |fmt|
      fmt.json { render json: {}, code: 200 }
    end
  end

  private

  def load_vote
    @forum_post_vote = @forum_post.votes.where(creator_id: CurrentUser.id).first
    raise ActiveRecord::RecordNotFound if @forum_post_vote.nil?
  end

  def load_forum_post
    @forum_post = ForumPost.find(params[:forum_post_id])
  end

  def validate_forum_post
    raise User::PrivilegeError unless @forum_post.visible?(CurrentUser.user)
    raise User::PrivilegeError unless @forum_post.votable?
  end

  def validate_no_vote_on_own_post
    raise User::PrivilegeError, "You cannot vote on your own requests" if @forum_post.creator == CurrentUser.user
  end

  def forum_post_vote_params
    params.fetch(:forum_post_vote, {}).permit(:score)
  end

  def ensure_lockdown_disabled
    render_expected_error(403, "Votes are disabled") if Security::Lockdown.votes_disabled? && !CurrentUser.is_staff?
  end
end
