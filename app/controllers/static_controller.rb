# frozen_string_literal: true

class StaticController < ApplicationController
  def privacy
    @page = format_wiki_page("e621:privacy_policy")
  end

  def terms_of_service
    @page = format_wiki_page("e621:terms_of_service")
  end

  def contact
    @page = format_wiki_page("e621:contact")
  end

  def takedown
    @page = format_wiki_page("e621:takedown")
  end

  def avoid_posting
    @page = format_wiki_page("avoid_posting")
  end

  def furid
    @posts = Cache.fetch("furid_gallery", expires_in: 1.day) do
      lookup = PostSets::Post.new("furid_(e621) status:any order:score", 1, limit: 4000).posts
      lookup.map { |post| [post.id, post.preview_file_url, post.uploader_name] }
    end
  end

  def not_found
    render "static/404", formats: [:html], status: 404
  end

  def error
  end

  def site_map
  end

  def home
    render layout: "blank"
  end

  def theme
  end

  def disable_mobile_mode
    if CurrentUser.is_member?
      user = CurrentUser.user
      user.disable_responsive_mode = !user.disable_responsive_mode
      user.save
    else
      if cookies[:nmm]
        cookies.delete(:nmm)
      else
        cookies.permanent[:nmm] = '1'
      end
    end
    redirect_back fallback_location: posts_path
  end

  def discord
    if request.post?
      redirect_to(Danbooru.config.discord_site, allow_other_host: true)
    end
  end

  private

  def format_wiki_page(name)
    wiki = WikiPage.titled(name)
    return WikiPage.new(body: "Wiki page \"#{name}\" not found.") if wiki.blank?
    wiki
  end
end
