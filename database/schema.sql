-- Rivora — B2B Hospitality Resource Exchange
-- MySQL schema

CREATE DATABASE IF NOT EXISTS rivora CHARACTER SET utf8mb4;
USE rivora;

-- ---------------------------------------------------------------
-- businesses: every account, whether they act as provider, seeker,
-- or both (a business can list resources AND request them)
-- ---------------------------------------------------------------
CREATE TABLE businesses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150)  NOT NULL,
    business_type   VARCHAR(50)   NOT NULL,   -- hotel, restaurant, caterer, venue, resort, event_organizer
    email           VARCHAR(150)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255)  NOT NULL,
    phone           VARCHAR(20),
    location        VARCHAR(255),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    verified        BOOLEAN       DEFAULT FALSE,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------
-- resources: listings created by providers
-- ---------------------------------------------------------------
CREATE TABLE resources (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    provider_id     INT NOT NULL,
    type            VARCHAR(50)   NOT NULL,   -- space, vehicle, kitchen, furniture, av_equipment, staff
    name            VARCHAR(150)  NOT NULL,
    description     TEXT,
    capacity        INT,
    quantity        INT           DEFAULT 1,
    price_per_unit  DECIMAL(10,2) NOT NULL,
    price_unit      VARCHAR(20)   NOT NULL,   -- per_hour, per_day
    min_duration    INT           DEFAULT 1,  -- in price_unit's unit
    conditions_text TEXT,
    location        VARCHAR(255),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    status          VARCHAR(20)   DEFAULT 'active',  -- active, inactive
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES businesses(id) ON DELETE CASCADE,
    INDEX idx_resource_type_location (type, location),
    INDEX idx_resource_provider (provider_id)
);

-- ---------------------------------------------------------------
-- bookings: the core transactional table — one row per request/
-- negotiation/confirmation between a seeker and a resource
-- ---------------------------------------------------------------
CREATE TABLE bookings (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    resource_id     INT NOT NULL,
    seeker_id       INT NOT NULL,
    start_time      DATETIME NOT NULL,
    end_time        DATETIME NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',  -- pending, negotiating, confirmed, completed, rejected, cancelled
    requested_price DECIMAL(10,2),
    agreed_price    DECIMAL(10,2),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (seeker_id)   REFERENCES businesses(id) ON DELETE CASCADE,
    -- the single most important index in the schema: every conflict-check
    -- query filters on resource_id + status and range-scans the time columns
    INDEX idx_booking_conflict (resource_id, status, start_time, end_time)
);

-- ---------------------------------------------------------------
-- requests: a seeker posting a requirement instead of browsing
-- (matched against resources by the matching engine)
-- ---------------------------------------------------------------
CREATE TABLE requests (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    seeker_id         INT NOT NULL,
    resource_type     VARCHAR(50) NOT NULL,
    required_capacity INT,
    budget            DECIMAL(10,2),
    location          VARCHAR(255),
    latitude          DECIMAL(9,6),
    longitude         DECIMAL(9,6),
    needed_from       DATETIME NOT NULL,
    needed_to         DATETIME NOT NULL,
    status            VARCHAR(20) DEFAULT 'open',   -- open, fulfilled, closed
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seeker_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------
-- reviews: post-transaction rating, one per completed booking
-- ---------------------------------------------------------------
CREATE TABLE reviews (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    booking_id  INT NOT NULL UNIQUE,
    reviewer_id INT NOT NULL,      -- business that wrote the review
    rating      TINYINT NOT NULL,  -- 1 to 5
    comment     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)  REFERENCES bookings(id)   ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES businesses(id) ON DELETE CASCADE,
    CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5)
);

-- ---------------------------------------------------------------
-- offers: counter-offers and negotiation history for bookings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    booking_id  INT NOT NULL,
    sender_id   INT NOT NULL,
    receiver_id INT NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    status      VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)  REFERENCES bookings(id)   ON DELETE CASCADE,
    FOREIGN KEY (sender_id)   REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------
-- seed data — enough to demo search, matching, and conflict-check
-- ---------------------------------------------------------------
INSERT INTO businesses (name, business_type, email, password_hash, phone, location, latitude, longitude, verified) VALUES
('Grand Palm Hotel',       'hotel',      'grandpalm@demo.com',   '$2b$12$replace_with_real_hash', '9800000001', 'Andheri, Mumbai', 19.1197, 72.8468, TRUE),
('Coastal Caterers',       'caterer',    'coastal@demo.com',     '$2b$12$replace_with_real_hash', '9800000002', 'Bandra, Mumbai',  19.0596, 72.8295, TRUE),
('Skyline Banquets',       'venue',      'skyline@demo.com',     '$2b$12$replace_with_real_hash', '9800000003', 'Powai, Mumbai',   19.1176, 72.9060, FALSE),
('Sunrise Event Planners', 'event_organizer', 'sunrise@demo.com','$2b$12$replace_with_real_hash', '9800000004', 'Andheri, Mumbai', 19.1245, 72.8479, TRUE);

INSERT INTO resources (provider_id, type, name, description, capacity, quantity, price_per_unit, price_unit, min_duration, conditions_text, location, latitude, longitude) VALUES
(1, 'space',        'Palm Banquet Hall',        'AC banquet hall, stage included',    300, 1, 15000.00, 'per_day',  1, 'Delivery not included', 'Andheri, Mumbai', 19.1197, 72.8468),
(1, 'parking',       'Hotel Parking Lot',        'Covered parking, 40 vehicle slots',   40, 1,  3000.00, 'per_day',  1, 'Security included',      'Andheri, Mumbai', 19.1197, 72.8468),
(2, 'vehicle',       'Refrigerated Delivery Van','Van for cold-chain food transport',    NULL, 2, 1200.00, 'per_hour', 4, 'Driver included',        'Bandra, Mumbai',  19.0596, 72.8295),
(2, 'kitchen',       'Commercial Kitchen Slot',  'Extra prep-kitchen capacity',          NULL, 1, 2000.00, 'per_hour', 2, 'Utensils not included',  'Bandra, Mumbai',  19.0596, 72.8295),
(3, 'furniture',     'Banquet Chairs (Gold)',    'Chiavari chairs, gold finish',         NULL, 200, 25.00,  'per_day',  1, 'Min order 50 chairs',    'Powai, Mumbai',   19.1176, 72.9060),
(3, 'av_equipment',  'AV and Sound System',      'Full PA system with wireless mics',    NULL, 3, 5000.00, 'per_day',  1, 'Technician available on request', 'Powai, Mumbai', 19.1176, 72.9060);
