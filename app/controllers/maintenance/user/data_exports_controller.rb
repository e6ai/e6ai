# frozen_string_literal: true

module Maintenance
  module User
    class DataExportsController < ApplicationController
      before_action :logged_in_only

      # The export loads every favorite and set in one request, so unlike most
      # GET endpoints (which api_check leaves unthrottled) it is rate limited.
      RATE_LIMIT = 5
      RATE_PERIOD = 1.hour

      def show
        raise APIThrottled if RateLimiter.throttle!("user_data_export:#{CurrentUser.user.id}", limit: RATE_LIMIT, period: RATE_PERIOD)

        export = UserDataExport.new(CurrentUser.user)
        response.headers["Cache-Control"] = "no-store"
        send_data(export.to_json, type: "application/json", disposition: "attachment", filename: export.filename)
      end
    end
  end
end
