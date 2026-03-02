-- FSI Phase 2: Performance Indexes

-- Resources
CREATE INDEX idx_resources_priority ON resources(priority);
CREATE INDEX idx_resources_topic ON resources(topic);
CREATE INDEX idx_resources_jurisdiction ON resources(jurisdiction);
CREATE INDEX idx_resources_is_archived ON resources(is_archived);
CREATE INDEX idx_resources_added_date ON resources(added_date);
CREATE INDEX idx_resources_tags ON resources USING GIN(tags);
CREATE INDEX idx_resources_modes ON resources USING GIN(modes);

-- Foreign key lookups
CREATE INDEX idx_timelines_resource_id ON timelines(resource_id);
CREATE INDEX idx_changelog_resource_id ON changelog(resource_id);
CREATE INDEX idx_disputes_resource_id ON disputes(resource_id);
CREATE INDEX idx_xrefs_source_id ON cross_references(source_id);
CREATE INDEX idx_xrefs_target_id ON cross_references(target_id);
CREATE INDEX idx_supersessions_old_id ON supersessions(old_id);
CREATE INDEX idx_supersessions_new_id ON supersessions(new_id);

-- Staged updates by status
CREATE INDEX idx_staged_status ON staged_updates(status);
