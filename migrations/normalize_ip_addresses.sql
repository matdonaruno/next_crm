-- Normalize IPv6-mapped IPv4 addresses in sensor_logs table
-- This will convert ::ffff:192.168.0.16 to 192.168.0.16

-- First, check current IP addresses
SELECT DISTINCT ip_address 
FROM sensor_logs 
WHERE ip_address LIKE '::ffff:%'
ORDER BY ip_address;

-- Update IPv6-mapped IPv4 addresses to plain IPv4
UPDATE sensor_logs
SET ip_address = SUBSTRING(ip_address FROM 8)
WHERE ip_address LIKE '::ffff:%';

-- Verify the update
SELECT COUNT(*) as updated_count
FROM sensor_logs
WHERE ip_address LIKE '::ffff:%';

-- Also update sensor_devices table if needed
UPDATE sensor_devices
SET ip_address = SUBSTRING(ip_address FROM 8)
WHERE ip_address LIKE '::ffff:%';

-- Show updated IP addresses
SELECT DISTINCT ip_address 
FROM sensor_logs 
WHERE ip_address IS NOT NULL
ORDER BY ip_address;