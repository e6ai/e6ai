# frozen_string_literal: true

module Maintenance
  module User
    class DataExportsController < ApplicationController
      before_action :logged_in_only

      def show
        export = UserDataExport.new(CurrentUser.user)
        response.headers["Cache-Control"] = "no-store"
        send_data(export.to_json, type: "application/json", disposition: "attachment", filename: export.filename)
      end
    end
  end
end
