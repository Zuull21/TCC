CREATE DATABASE IF NOT EXISTS tourmap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tourmap;

-- ============================================================
-- TABELA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  name             VARCHAR(100)      NOT NULL,
  email            VARCHAR(150)      NOT NULL,
  password_hash    VARCHAR(255)      NOT NULL,
  age              TINYINT UNSIGNED  NULL,
  email_verified   TINYINT(1)        NOT NULL DEFAULT 0,
  role             ENUM('tourist','guide','admin') NOT NULL DEFAULT 'tourist',
  avatar_url       VARCHAR(500)      NULL,
  bio              TEXT              NULL,
  city             VARCHAR(100)      NULL,
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABELA: verification_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_codes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  code        CHAR(6)      NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_vc_user_id (user_id),
  KEY idx_vc_code    (code),

  CONSTRAINT fk_vc_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABELA: places
-- ============================================================
CREATE TABLE IF NOT EXISTS places (
  id            INT UNSIGNED          NOT NULL AUTO_INCREMENT,
  name          VARCHAR(150)          NOT NULL,
  description   TEXT                  NULL,
  address       VARCHAR(300)          NULL,
  latitude      DECIMAL(10,7)         NOT NULL,
  longitude     DECIMAL(10,7)         NOT NULL,
  category      ENUM('cultura','esporte','gastronomia','natureza','arte','musica') NOT NULL,
  is_free       TINYINT(1)            NOT NULL DEFAULT 1,
  image_url     VARCHAR(500)          NULL,
  created_by    INT UNSIGNED          NULL,
  avg_rating    DECIMAL(2,1)          NOT NULL DEFAULT 0.0,
  review_count  INT UNSIGNED          NOT NULL DEFAULT 0,
  alert_level   ENUM('none','low','medium','high') NOT NULL DEFAULT 'none',
  city          VARCHAR(100)          NULL,
  state         CHAR(2)               NULL COMMENT 'UF ex: SP, RJ',
  created_at    DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_places_category    (category),
  KEY idx_places_alert_level (alert_level),
  KEY idx_places_geo         (latitude, longitude),

  CONSTRAINT fk_places_creator
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  -- Validações de coordenadas (MySQL 8.0.16+)
  CONSTRAINT chk_latitude
    CHECK (latitude  >= -90  AND latitude  <= 90),
  CONSTRAINT chk_longitude
    CHECK (longitude >= -180 AND longitude <= 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABELA: reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED  NOT NULL,
  place_id         INT UNSIGNED  NOT NULL,
  rating           TINYINT UNSIGNED NOT NULL,
  comment          TEXT          NULL,
  sentiment        ENUM('positive','neutral','negative') NULL,
  sentiment_score  FLOAT         NULL COMMENT 'Score normalizado 0.0 – 1.0',
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- Um usuário só pode avaliar o mesmo lugar uma vez
  UNIQUE KEY uq_review_user_place (user_id, place_id),
  KEY idx_reviews_place_id (place_id),

  CONSTRAINT fk_reviews_user
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_place
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT chk_rating
    CHECK (rating >= 1 AND rating <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABELA: posts
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED  NOT NULL,
  place_id     INT UNSIGNED  NULL,
  title        VARCHAR(200)  NOT NULL,
  content      LONGTEXT      NOT NULL,
  image_url    VARCHAR(500)  NULL,
  likes_count  INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_posts_user_id  (user_id),
  KEY idx_posts_place_id (place_id),

  CONSTRAINT fk_posts_user
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_posts_place
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABELA: alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  place_id      INT UNSIGNED  NOT NULL,
  level         ENUM('low','medium','high') NOT NULL,
  message       TEXT          NOT NULL,
  trigger_type  VARCHAR(80)   NULL COMMENT 'Ex: weather, crime, closure, maintenance',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME      NULL,

  PRIMARY KEY (id),
  KEY idx_alerts_place_id (place_id),
  KEY idx_alerts_is_active (is_active),

  CONSTRAINT fk_alerts_place
    FOREIGN KEY (place_id) REFERENCES places(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- VIEWS úteis
-- ============================================================

-- Lugares com nível de alerta ativo
CREATE OR REPLACE VIEW v_places_with_alerts AS
SELECT
  p.id,
  p.name,
  p.category,
  p.alert_level,
  p.avg_rating,
  p.review_count,
  COUNT(a.id) AS active_alert_count
FROM places p
LEFT JOIN alerts a ON a.place_id = p.id AND a.is_active = 1
GROUP BY p.id;


-- Top 10 lugares por rating com ao menos 1 avaliação
CREATE OR REPLACE VIEW v_top_places AS
SELECT
  p.id,
  p.name,
  p.category,
  p.city,
  p.avg_rating,
  p.review_count,
  p.is_free,
  p.image_url
FROM places p
WHERE p.review_count > 0
ORDER BY p.avg_rating DESC, p.review_count DESC
LIMIT 10;
