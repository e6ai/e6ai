# frozen_string_literal: true

class StaticController < ApplicationController
  def privacy
    @page_name = "e6ai:privacy_policy"
    @page = format_wiki_page(@page_name)
  end

  def terms_of_service
    @page_name = "e6ai:terms_of_service"
    @page = format_wiki_page(@page_name)
  end

  def contact
    @page_name = "e6ai:contact"
    @page = format_wiki_page(@page_name)
  end

  def takedown
    @page_name = "e621:takedown"
    @page = format_wiki_page(@page_name)
  end

  def avoid_posting
    @page_name = "avoid_posting"
    @page = format_wiki_page(@page_name)
  end

  def furid
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
    elsif cookies[:nmm]
      cookies.delete(:nmm)
    else
      cookies.permanent[:nmm] = "1"
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
