/** Shared membership only; every consumer independently applies its audience
 * rules. Explicit disabled rows suppress inheritance. Existing feed sequences
 * retain their stable order, and new sequences include newly public works.
 */
export const INHERITED_FEATURED_POSITION = Number.MAX_SAFE_INTEGER;
export const effectiveFeatured = `effective_featured AS (
  SELECT content_type,content_id,enabled,position,version FROM community.featured_content
  UNION ALL
  SELECT 'work',w.id,TRUE,${INHERITED_FEATURED_POSITION}::bigint,0
  FROM community.works w JOIN community.featured_users f ON f.user_id=w.author_id AND f.enabled
  WHERE NOT EXISTS(SELECT 1 FROM community.featured_content c WHERE c.content_type='work' AND c.content_id=w.id)
)`;
