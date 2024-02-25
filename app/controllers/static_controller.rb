# frozen_string_literal: true

class StaticController < ApplicationController
  def privacy
    @page = WikiPage.find_by(title: "e621:privacy_policy")
  end

  def terms_of_service
    @page = WikiPage.find_by(title: "e621:terms_of_service")
  end

  def contact
    @page = WikiPage.find_by(title: "e621:contact")
  end

  def takedown
    @page = WikiPage.find_by(title: "e621:takedown")
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
end
