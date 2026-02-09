/**
 * Dynamic Port Finder for Development Environment
 * Finds available ports in safe ranges
 */

import net from 'node:net';

const BACKEND_PORT_RANGE = { min: 13000, max: 13999 };
const DEFAULT_BACKEND_PORT = 13300;

const RESERVED_PORTS = new Set([
  80, 443, 8080, 8443,
  1433, 3306, 5432, 27017, 6379,
  5672, 11211,
  3000, 4200, 5000, 5173, 8000, 9000,
]);

/**
 * Check if a port is available
 */
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port in the specified range
 */
async function findAvailablePort(range = BACKEND_PORT_RANGE, preferred = DEFAULT_BACKEND_PORT) {
  // Try preferred port first
  if (preferred >= range.min && preferred <= range.max) {
    if (!RESERVED_PORTS.has(preferred) && await isPortAvailable(preferred)) {
      return preferred;
    }
  }
  
  // Scan range for available port
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    const port = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    
    if (RESERVED_PORTS.has(port)) continue;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`No available port found in range ${range.min}-${range.max}`);
}

export { findAvailablePort, BACKEND_PORT_RANGE, DEFAULT_BACKEND_PORT };
