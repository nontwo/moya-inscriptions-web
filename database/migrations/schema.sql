-- ============================================================
-- 摩崖碑刻数字平台 - PostgreSQL 数据库 Schema
-- 版本: v1.0
-- 日期: 2026-08-06
-- ============================================================

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. 地区表
-- ============================================================
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('province', 'city', 'county')),
    administrative_code VARCHAR(20) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regions_parent ON regions(parent_id);
CREATE INDEX idx_regions_level ON regions(level);

-- ============================================================
-- 2. 朝代表
-- ============================================================
CREATE TABLE dynasties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    sort_order INT NOT NULL,
    year_start INT NOT NULL,
    year_end INT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 碑刻类型表
-- ============================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    sort_order INT DEFAULT 0
);

-- ============================================================
-- 4. 书体表
-- ============================================================
CREATE TABLE script_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    sort_order INT DEFAULT 0
);

-- ============================================================
-- 5. 碑刻点位表（核心）
-- ============================================================
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_code VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    full_title VARCHAR(500),
    alias TEXT[] DEFAULT '{}',
    dynasty VARCHAR(50) NOT NULL,
    dynasty_year VARCHAR(100),
    category VARCHAR(50) NOT NULL,
    script_type VARCHAR(50) NOT NULL,
    calligrapher VARCHAR(200),
    engraver VARCHAR(200),
    inscriber VARCHAR(200),
    region_id UUID REFERENCES regions(id),
    province VARCHAR(50),
    city VARCHAR(50),
    county VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    coordinate_system VARCHAR(10) DEFAULT 'WGS84' CHECK (coordinate_system IN ('WGS84', 'GCJ02', 'BD09')),
    coordinate_precision VARCHAR(20) DEFAULT 'approximate' CHECK (coordinate_precision IN ('exact', 'approximate', 'area')),
    altitude DOUBLE PRECISION,
    address TEXT,
    dimensions VARCHAR(200),
    word_count INT DEFAULT 0,
    summary TEXT NOT NULL,
    full_description TEXT,
    research_notes TEXT,
    preservation_status VARCHAR(200),
    investigation_date VARCHAR(50),
    calligraphy_brushwork TEXT,
    calligraphy_structure TEXT,
    calligraphy_composition TEXT,
    calligraphy_style TEXT,
    calligraphy_features TEXT,
    calligraphy_significance TEXT,
    pinyin_index VARCHAR(500),
    tags TEXT[] DEFAULT '{}',
    cover_image VARCHAR(500),
    cover_thumbnail VARCHAR(500),
    publication_status VARCHAR(20) DEFAULT 'draft' CHECK (publication_status IN ('draft', 'review', 'published', 'archived')),
    seo_title VARCHAR(200),
    seo_description VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sites_region ON sites(region_id);
CREATE INDEX idx_sites_dynasty ON sites(dynasty);
CREATE INDEX idx_sites_category ON sites(category);
CREATE INDEX idx_sites_script_type ON sites(script_type);
CREATE INDEX idx_sites_calligrapher ON sites(calligrapher);
CREATE INDEX idx_sites_slug ON sites(slug);
CREATE INDEX idx_sites_status ON sites(publication_status);
CREATE INDEX idx_sites_pinyin ON sites(pinyin_index);
CREATE INDEX idx_sites_title_trgm ON sites USING gin (title gin_trgm_ops);

-- ============================================================
-- 6. 图片表（扩展坐标信息）
-- ============================================================
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    object_key VARCHAR(500) NOT NULL,
    thumbnail_key VARCHAR(500) NOT NULL,
    display_key VARCHAR(500) NOT NULL,
    original_key VARCHAR(500) NOT NULL,
    caption VARCHAR(500),
    description TEXT,
    image_type VARCHAR(30) NOT NULL CHECK (image_type IN ('cover', 'overview', 'context', 'detail', 'inscription_detail', 'reference')),
    sort_order INT DEFAULT 0,
    width INT NOT NULL,
    height INT NOT NULL,
    file_size BIGINT,
    format VARCHAR(20),
    camera VARCHAR(200),
    lens VARCHAR(200),
    focal_length VARCHAR(50),
    aperture VARCHAR(20),
    shutter_speed VARCHAR(20),
    iso INT,
    date_taken VARCHAR(50),
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    sha256 VARCHAR(64) NOT NULL,
    publication_status VARCHAR(20) DEFAULT 'published' CHECK (publication_status IN ('draft', 'review', 'published', 'archived')),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_site ON images(site_id);
CREATE INDEX idx_images_type ON images(image_type);
CREATE INDEX idx_images_hash ON images(sha256);

-- ============================================================
-- 7. 图片标注表（新增：存储图片上的文字热区坐标）
-- ============================================================
CREATE TABLE image_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    character_info TEXT,
    calligraphy_note TEXT,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    width DOUBLE PRECISION NOT NULL,
    height DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_annotations_image ON image_annotations(image_id);

-- ============================================================
-- 8. 书家/人物表（新增）
-- ============================================================
CREATE TABLE calligraphers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    courtesy_name VARCHAR(50),
    art_name VARCHAR(50),
    dynasty VARCHAR(50) NOT NULL,
    birth_year INT,
    death_year INT,
    birth_place VARCHAR(200),
    short_bio TEXT,
    full_bio TEXT,
    style_description TEXT,
    achievements TEXT[] DEFAULT '{}',
    avatar_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calligraphers_dynasty ON calligraphers(dynasty);
CREATE INDEX idx_calligraphers_name ON calligraphers(name);

-- ============================================================
-- 9. 书法作品表（新增）
-- ============================================================
CREATE TABLE calligraphy_works (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    calligrapher_id UUID REFERENCES calligraphers(id) ON DELETE SET NULL,
    script_type VARCHAR(50) NOT NULL,
    style VARCHAR(100),
    dynasty VARCHAR(50) NOT NULL,
    current_location VARCHAR(300),
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    description TEXT,
    dimensions VARCHAR(200),
    material VARCHAR(100),
    significance TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_works_calligrapher ON calligraphy_works(calligrapher_id);
CREATE INDEX idx_works_site ON calligraphy_works(site_id);
CREATE INDEX idx_works_dynasty ON calligraphy_works(dynasty);

-- ============================================================
-- 10. 关系表（新增）
-- ============================================================
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_type VARCHAR(20) NOT NULL CHECK (from_type IN ('calligrapher', 'site', 'work')),
    from_id UUID NOT NULL,
    from_name VARCHAR(200),
    to_type VARCHAR(20) NOT NULL CHECK (to_type IN ('calligrapher', 'site', 'work')),
    to_id UUID NOT NULL,
    to_name VARCHAR(200),
    relation_type VARCHAR(20) NOT NULL CHECK (relation_type IN ('撰文', '书丹', '刻工', '师生', '同僚', '出资', '监造', '相关')),
    description TEXT,
    period VARCHAR(100),
    evidence TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_relations_from ON relationships(from_type, from_id);
CREATE INDEX idx_relations_to ON relationships(to_type, to_id);
CREATE INDEX idx_relations_type ON relationships(relation_type);

-- ============================================================
-- 11. 标签表
-- ============================================================
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 点位-标签关联
CREATE TABLE site_tags (
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (site_id, tag_id)
);

-- ============================================================
-- 12. 参考来源表
-- ============================================================
CREATE TABLE site_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(200) NOT NULL,
    year INT,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('论文', '图录', '地方志', '网页', '专著', '其他')),
    publisher VARCHAR(200),
    url VARCHAR(1000),
    citation_text TEXT NOT NULL,
    pages VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refs_site ON site_references(site_id);

-- ============================================================
-- 13. 数据导入日志表
-- ============================================================
CREATE TABLE import_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    total_rows INT,
    success_rows INT DEFAULT 0,
    error_rows INT DEFAULT 0,
    warnings JSONB DEFAULT '[]',
    errors JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    operator VARCHAR(100)
);

-- ============================================================
-- 时间戳自动更新触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_regions_updated BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_calligraphers_updated BEFORE UPDATE ON calligraphers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
