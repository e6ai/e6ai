# frozen_string_literal: true

class TagCategory
  MAPPING = {
    "general" => 0,
    "gen" => 0,
    "director" => 1,
    "direct" => 1,
    "dir" => 1,
    "character" => 4,
    "char" => 4,
    "ch" => 4,
    "oc" => 4,
    "species" => 5,
    "spec" => 5,
    "invalid" => 6,
    "inv" => 6,
    "meta" => 7,
  }.freeze

  CANONICAL_MAPPING = {
    "General" => 0,
    "Director" => 1,
    "Character" => 4,
    "Species" => 5,
    "Invalid" => 6,
    "Meta" => 7,
  }.freeze

  REVERSE_MAPPING = {
    0 => "general",
    1 => "director",
    4 => "character",
    5 => "species",
    6 => "invalid",
    7 => "meta",
  }.freeze

  SHORT_NAME_MAPPING = {
    "gen" => "general",
    "dir" => "director",
    "char" => "character",
    "spec" => "species",
    "inv" => "invalid",
    "meta" => "meta",
  }.freeze

  HEADER_MAPPING = {
    "general" => "General",
    "director" => "Director",
    "character" => "Characters",
    "species" => "Species",
    "invalid" => "Invalid",
    "meta" => "Meta",
  }.freeze

  ADMIN_ONLY_MAPPING = {
    "general" => false,
    "director" => false,
    "character" => false,
    "species" => false,
    "invalid" => true,
    "meta" => true,
  }.freeze

  HUMANIZED_MAPPING = {
    "director" => {
      "slice" => 0,
      "exclusion" => [],
      "regexmap" => //,
      "formatstr" => "directed by %s",
    },
    "character" => {
      "slice" => 5,
      "exclusion" => [],
      "regexmap" => /^(.+?)(?:_\(.+\))?$/,
      "formatstr" => "%s",
    },
  }.freeze

  CATEGORIES = %w[general species character director invalid meta].freeze
  CATEGORY_IDS = CANONICAL_MAPPING.values

  SHORT_NAME_LIST = SHORT_NAME_MAPPING.keys
  HUMANIZED_LIST = %w[character director].freeze
  SPLIT_HEADER_LIST = %w[invalid director character species general meta].freeze
  CATEGORIZED_LIST = %w[invalid director character species meta general].freeze

  SHORT_NAME_REGEX = SHORT_NAME_LIST.join("|").freeze
end
