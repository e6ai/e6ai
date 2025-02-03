#!/usr/bin/env ruby
# frozen_string_literal: true

TagAlias.where(creator_id: 0).find_in_batches(batch_size: 1_000) do |batch|
  batch.each do |tag_alias|
    tag_alias.update({ creator_id: 2 })
  end
end

TagImplication.where(creator_id: 0).find_in_batches(batch_size: 1_000) do |batch|
  batch.each do |tag_implication|
    tag_implication.update({ creator_id: 2 })
  end
end
