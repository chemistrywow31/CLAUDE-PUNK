/**
 * CLAUDE PUNK - Dynamic Port Manager
 *
 * Intelligent port allocation system that:
 * - Scans for available ports in safe ranges
 * - Avoids common service ports (MySQL, Redis, etc.)
 * - Handles port conflicts automatically
 * - Persists allocated ports for consistent experience
 */

import net from 'node:net';
import log from 'electron-log';

// ──── Port Configuration ────────────────────────────────────────────────────

/**
 * Common ports to avoid (well-known services)
 * These ports are likely to be occupied by system services
 */
const RESERVED_PORTS = new Set([
  // Web servers
  80, 443, 8080, 8443,

  // Databases
  1433,  // SQL Server
  3306,  // MySQL
  5432,  // PostgreSQL
  27017, // MongoDB
  6379,  // Redis

  // Message queues / Cache
  5672,  // RabbitMQ
  11211, // Memcached

  // Development tools
  3000,  // Common dev server
  4200,  // Angular CLI
  5000,  // Flask default
  5173,  // Vite default
  8000,  // Common dev server
  9000,  // PHP-FPM

  // Other services
  7000, 7001, 7002,  // Redis Cluster
  9200, 9300,        // Elasticsearch
]);

/**
 * Safe port ranges for dynamic allocation
 * Using high ephemeral ports to minimize conflicts
 */
const PORT_RANGES = {
  backend: {
    min: 13000,  // Start at 13000 to avoid common ranges
    max: 13999,
    preferred: 13300, // Preferred starting point
  },
  frontend: {
    min: 15000,  // Separated from backend range
    max: 15999,
    preferred: 15173, // Similar to Vite's 5173 but in safe range
  },
};

// ──── Port Availability Checking ────────────────────────────────────────────

/**
 * Check if a specific port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - true if port is available
 */
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Other error, consider unavailable
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Check if port is in reserved/dangerous range
 * @param {number} port - Port to check
 * @returns {boolean} - true if port should be avoided
 */
function isReservedPort(port) {
  return RESERVED_PORTS.has(port);
}

// ──── Port Allocation ───────────────────────────────────────────────────────

/**
 * Find an available port in a given range
 * @param {Object} range - Port range configuration {min, max, preferred}
 * @param {string} serviceName - Name of service (for logging)
 * @returns {Promise<number|null>} - Available port or null if none found
 */
async function findAvailablePort(range, serviceName) {
  const { min, max, preferred } = range;

  log.info(`[PortManager] Finding available port for ${serviceName}...`);
  log.info(`[PortManager] Range: ${min}-${max}, Preferred: ${preferred}`);

  // Step 1: Try preferred port first
  if (preferred >= min && preferred <= max) {
    if (!isReservedPort(preferred)) {
      const available = await isPortAvailable(preferred);
      if (available) {
        log.info(`[PortManager] ✅ Using preferred port ${preferred} for ${serviceName}`);
        return preferred;
      } else {
        log.info(`[PortManager] ⚠️ Preferred port ${preferred} is occupied`);
      }
    }
  }

  // Step 2: Scan range for available port
  // Use a randomized approach to avoid always picking the same ports
  const candidates = [];
  for (let port = min; port <= max; port++) {
    if (!isReservedPort(port)) {
      candidates.push(port);
    }
  }

  // Shuffle candidates to randomize selection
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Try up to 50 random ports
  const maxAttempts = Math.min(50, candidates.length);
  for (let i = 0; i < maxAttempts; i++) {
    const port = candidates[i];
    const available = await isPortAvailable(port);

    if (available) {
      log.info(`[PortManager] ✅ Found available port ${port} for ${serviceName}`);
      return port;
    }

    // Log every 10 attempts
    if ((i + 1) % 10 === 0) {
      log.info(`[PortManager] Still searching... (${i + 1}/${maxAttempts} attempts)`);
    }
  }

  // Step 3: No port found
  log.error(`[PortManager] ❌ No available port found for ${serviceName} in range ${min}-${max}`);
  return null;
}

/**
 * Allocate ports for both backend and frontend
 * @param {Object} currentPorts - Current port configuration (optional)
 * @returns {Promise<{backend: number, frontend: number}|null>}
 */
export async function allocatePorts(currentPorts = null) {
  log.info('[PortManager] Starting port allocation...');

  const result = {
    backend: null,
    frontend: null,
  };

  // Try to reuse current ports if available
  if (currentPorts?.backend) {
    const backendAvailable = await isPortAvailable(currentPorts.backend);
    if (backendAvailable) {
      log.info(`[PortManager] ✅ Reusing existing backend port ${currentPorts.backend}`);
      result.backend = currentPorts.backend;
    } else {
      log.info(`[PortManager] ⚠️ Existing backend port ${currentPorts.backend} is occupied`);
    }
  }

  if (currentPorts?.frontend) {
    const frontendAvailable = await isPortAvailable(currentPorts.frontend);
    if (frontendAvailable) {
      log.info(`[PortManager] ✅ Reusing existing frontend port ${currentPorts.frontend}`);
      result.frontend = currentPorts.frontend;
    } else {
      log.info(`[PortManager] ⚠️ Existing frontend port ${currentPorts.frontend} is occupied`);
    }
  }

  // Find new backend port if needed
  if (!result.backend) {
    result.backend = await findAvailablePort(PORT_RANGES.backend, 'backend');
    if (!result.backend) {
      log.error('[PortManager] ❌ Failed to allocate backend port');
      return null;
    }
  }

  // Find new frontend port if needed
  if (!result.frontend) {
    result.frontend = await findAvailablePort(PORT_RANGES.frontend, 'frontend');
    if (!result.frontend) {
      log.error('[PortManager] ❌ Failed to allocate frontend port');
      return null;
    }
  }

  log.info('[PortManager] ✅ Port allocation complete:');
  log.info(`[PortManager]   Backend:  ${result.backend}`);
  log.info(`[PortManager]   Frontend: ${result.frontend}`);

  return result;
}

// ──── Port Validation ───────────────────────────────────────────────────────

/**
 * Validate that allocated ports are still available
 * @param {Object} ports - Port configuration {backend, frontend}
 * @returns {Promise<{backend: boolean, frontend: boolean}>}
 */
export async function validatePorts(ports) {
  const result = {
    backend: false,
    frontend: false,
  };

  if (ports?.backend) {
    result.backend = await isPortAvailable(ports.backend);
  }

  if (ports?.frontend) {
    result.frontend = await isPortAvailable(ports.frontend);
  }

  return result;
}

/**
 * Get port range information (for UI display)
 * @returns {Object} - Port ranges configuration
 */
export function getPortRanges() {
  return {
    backend: { ...PORT_RANGES.backend },
    frontend: { ...PORT_RANGES.frontend },
    reserved: Array.from(RESERVED_PORTS).sort((a, b) => a - b),
  };
}

/**
 * Check if a port conflict would occur with known services
 * @param {number} port - Port to check
 * @returns {string|null} - Service name if conflict detected, null otherwise
 */
export function detectPortConflict(port) {
  const knownServices = {
    80: 'HTTP',
    443: 'HTTPS',
    1433: 'SQL Server',
    3000: 'Common Dev Server',
    3306: 'MySQL',
    5000: 'Flask',
    5173: 'Vite',
    5432: 'PostgreSQL',
    6379: 'Redis',
    7000: 'Redis Cluster',
    8080: 'HTTP Proxy',
    27017: 'MongoDB',
  };

  return knownServices[port] || null;
}
