/**
 * Every statement is parameterized and confined to the community namespace.
 * Root comments read newest-first and replies oldest-first; both orders are
 * total, so pagination never repeats or drops a row.
 */

const commentAuthorJoin = `
  JOIN community.public_users u ON u.id = c.author_id
`;

export const countVisibleCommentsSql = `
  SELECT COUNT(*)::text AS total
  FROM community.catalog_comments c
  WHERE c.catalog_id = $1::text AND c.moderation = 'visible'
`;

export const listVisibleCommentsSql = `
  SELECT c.id, c.catalog_id, c.text, c.created_at, c.moderation,
         u.id AS author_id, u.display_name AS author_display_name
  FROM community.catalog_comments c
  ${commentAuthorJoin}
  WHERE c.catalog_id = $1::text AND c.moderation = 'visible'
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT $2::integer OFFSET $3::bigint
`;

/** The bounded first page of visible replies for each root on the page. */
export const listEmbeddedRepliesSql = `
  SELECT id, root_comment_id, text, created_at, moderation,
         author_id, author_display_name,
         reply_to_author_id, reply_to_display_name
  FROM (
    SELECT r.id, r.root_comment_id, r.text, r.created_at, r.moderation,
           u.id AS author_id, u.display_name AS author_display_name,
           ru.id AS reply_to_author_id,
           ru.display_name AS reply_to_display_name,
           ROW_NUMBER() OVER (
             PARTITION BY r.root_comment_id
             ORDER BY r.created_at ASC, r.id ASC
           ) AS position
    FROM community.catalog_comment_replies r
    JOIN community.public_users u ON u.id = r.author_id
    LEFT JOIN community.catalog_comment_replies t
      ON t.id = r.reply_to_reply_id AND t.moderation = 'visible'
    LEFT JOIN community.public_users ru ON ru.id = t.author_id
    WHERE r.root_comment_id = ANY($1::text[]) AND r.moderation = 'visible'
  ) ranked
  WHERE position <= $2::integer
  ORDER BY root_comment_id ASC, created_at ASC, id ASC
`;

export const countVisibleRepliesSql = `
  SELECT COUNT(*)::text AS total
  FROM community.catalog_comment_replies r
  WHERE r.root_comment_id = $1::text AND r.moderation = 'visible'
`;

export const listVisibleRepliesSql = `
  SELECT r.id, r.root_comment_id, r.text, r.created_at, r.moderation,
         u.id AS author_id, u.display_name AS author_display_name,
         ru.id AS reply_to_author_id, ru.display_name AS reply_to_display_name
  FROM community.catalog_comment_replies r
  JOIN community.public_users u ON u.id = r.author_id
  LEFT JOIN community.catalog_comment_replies t
    ON t.id = r.reply_to_reply_id AND t.moderation = 'visible'
  LEFT JOIN community.public_users ru ON ru.id = t.author_id
  WHERE r.root_comment_id = $1::text AND r.moderation = 'visible'
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT $2::integer OFFSET $3::bigint
`;

export const findCommentSql = `
  SELECT c.id, c.catalog_id, c.text, c.created_at, c.moderation,
         u.id AS author_id, u.display_name AS author_display_name
  FROM community.catalog_comments c
  ${commentAuthorJoin}
  WHERE c.id = $1::text
`;

export const findReplySql = `
  SELECT r.id, r.root_comment_id, r.text, r.created_at, r.moderation,
         u.id AS author_id, u.display_name AS author_display_name,
         ru.id AS reply_to_author_id, ru.display_name AS reply_to_display_name
  FROM community.catalog_comment_replies r
  JOIN community.public_users u ON u.id = r.author_id
  LEFT JOIN community.catalog_comment_replies t ON t.id = r.reply_to_reply_id
  LEFT JOIN community.public_users ru ON ru.id = t.author_id
  WHERE r.id = $1::text
`;

export const insertCommentSql = `
  WITH inserted AS (
    INSERT INTO community.catalog_comments
      (id, catalog_id, author_id, text, moderation, created_at)
    VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz)
    RETURNING id, catalog_id, author_id, text, moderation, created_at
  )
  SELECT c.id, c.catalog_id, c.text, c.created_at, c.moderation,
         u.id AS author_id, u.display_name AS author_display_name
  FROM inserted c
  ${commentAuthorJoin}
`;

export const insertReplySql = `
  WITH inserted AS (
    INSERT INTO community.catalog_comment_replies
      (id, root_comment_id, author_id, text, moderation, created_at,
       reply_to_reply_id)
    VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz,
            $7::text)
    RETURNING id, root_comment_id, author_id, text, moderation, created_at,
              reply_to_reply_id
  )
  SELECT r.id, r.root_comment_id, r.text, r.created_at, r.moderation,
         u.id AS author_id, u.display_name AS author_display_name,
         ru.id AS reply_to_author_id, ru.display_name AS reply_to_display_name
  FROM inserted r
  JOIN community.public_users u ON u.id = r.author_id
  LEFT JOIN community.catalog_comment_replies t ON t.id = r.reply_to_reply_id
  LEFT JOIN community.public_users ru ON ru.id = t.author_id
`;

/**
 * Comment ids are unique across both tables, so at most one branch matches.
 * `$5` carries the states the requested transition may leave, so an
 * out-of-machine edge (approving a hidden item, hiding a pending one) matches
 * no row and surfaces as 404 instead of silently rewriting the state.
 */
export const applyCommentModerationSql = `
  WITH root AS (
    UPDATE community.catalog_comments
    SET moderation = $2::text, moderated_by = $3::text,
        moderated_at = $4::timestamptz
    WHERE id = $1::text AND moderation = ANY($5::text[])
    RETURNING id, moderation
  ), reply AS (
    UPDATE community.catalog_comment_replies
    SET moderation = $2::text, moderated_by = $3::text,
        moderated_at = $4::timestamptz
    WHERE id = $1::text AND moderation = ANY($5::text[])
    RETURNING id, moderation
  )
  SELECT id, moderation, 'comment' AS kind FROM root
  UNION ALL
  SELECT id, moderation, 'reply' AS kind FROM reply
`;

const operatorCommentUnion = `
  SELECT c.id, 'comment' AS kind, c.catalog_id, NULL::text AS root_comment_id,
         c.text, c.created_at, c.moderation,
         u.id AS author_id, u.handle AS author_handle,
         u.display_name AS author_display_name, u.status AS author_status
  FROM community.catalog_comments c
  JOIN community.public_users u ON u.id = c.author_id
  UNION ALL
  SELECT r.id, 'reply' AS kind, c.catalog_id, r.root_comment_id,
         r.text, r.created_at, r.moderation,
         u.id AS author_id, u.handle AS author_handle,
         u.display_name AS author_display_name, u.status AS author_status
  FROM community.catalog_comment_replies r
  JOIN community.catalog_comments c ON c.id = r.root_comment_id
  JOIN community.public_users u ON u.id = r.author_id
`;

export const countOperatorCommentsSql = `
  SELECT COUNT(*)::text AS total
  FROM (${operatorCommentUnion}) entries
  WHERE ($1::text IS NULL OR entries.moderation = $1::text)
`;

export const listOperatorCommentsSql = `
  SELECT * FROM (${operatorCommentUnion}) entries
  WHERE ($1::text IS NULL OR entries.moderation = $1::text)
  ORDER BY entries.created_at DESC, entries.id DESC
  LIMIT $2::integer OFFSET $3::bigint
`;

export const readPublicationSettingSql = `
  SELECT policy, updated_at, updated_by
  FROM community.publication_setting
  WHERE id = 'publication'
`;

export const writePublicationSettingSql = `
  UPDATE community.publication_setting
  SET policy = $1::text, updated_by = $2::text, updated_at = $3::timestamptz
  WHERE id = 'publication'
`;

export const insertModerationEventSql = `
  INSERT INTO community.moderation_events
    (id, occurred_at, operator_label, action, subject_kind, subject_id, detail)
  VALUES ($1::text, $2::timestamptz, $3::text, $4::text, $5::text, $6::text,
          $7::text)
`;

export const findUserByIdSql = `
  SELECT id, handle, display_name, status
  FROM community.public_users
  WHERE id = $1::text
`;

export const setUserStatusSql = `
  UPDATE community.public_users
  SET status = $2::text, updated_at = $3::timestamptz
  WHERE id = $1::text
  RETURNING id, handle, display_name, status
`;

export const revokeUserSessionsSql = `
  UPDATE community.sessions
  SET revoked_at = $2::timestamptz
  WHERE user_id = $1::text
    AND revoked_at IS NULL
    AND expires_at > $2::timestamptz
`;
