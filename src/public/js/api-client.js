/**
 * API Client for centralized fetch operations
 * Handles common headers, error parsing, and auth redirection
 */
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_UNSAFE_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

const getCookieValue = (name) => {
  const cookiePrefix = `${name}=`;
  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    if (trimmedCookie.startsWith(cookiePrefix)) {
      return decodeURIComponent(trimmedCookie.slice(cookiePrefix.length));
    }
  }

  return null;
};

const resolveRequestMethod = (input, options = {}) => {
  if (typeof options.method === 'string' && options.method.trim().length > 0) {
    return options.method.toUpperCase();
  }

  if (input && typeof input === 'object' && typeof input.method === 'string' && input.method.trim().length > 0) {
    return input.method.toUpperCase();
  }

  return 'GET';
};

const resolveRequestUrl = (input) => {
  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input, window.location.origin);
  }

  if (input && typeof input === 'object' && typeof input.url === 'string') {
    return new URL(input.url, window.location.origin);
  }

  return null;
};

const isSameOriginRequest = (input) => {
  const requestUrl = resolveRequestUrl(input);
  return requestUrl ? requestUrl.origin === window.location.origin : false;
};

const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

if (originalFetch) {
  window.fetch = (input, options = {}) => {
    const method = resolveRequestMethod(input, options);

    if (!CSRF_UNSAFE_METHODS.has(method) || !isSameOriginRequest(input)) {
      return originalFetch(input, options);
    }

    const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
    if (!csrfToken) {
      return originalFetch(input, options);
    }

    const mergedHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    if (options.headers) {
      const incomingHeaders = new Headers(options.headers);
      incomingHeaders.forEach((value, key) => mergedHeaders.set(key, value));
    }
    mergedHeaders.set(CSRF_HEADER_NAME, csrfToken);

    const nextOptions = {
      ...options,
      credentials: options.credentials || 'same-origin',
      headers: mergedHeaders,
    };

    return originalFetch(input, nextOptions);
  };
}

const apiClient = {
  /**
   * Generic fetch wrapper
   * @param {string} endpoint - API endpoint (e.g., '/api/auth/me')
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} - JSON response or throws Error
   */
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(endpoint, config);

      // Handle Unauthorized (401) - Redirect to login
      if (response.status === 401) {
        // Avoid redirect loop if already on login/register
        const path = window.location.pathname;
        if (path !== '/login.html' && path !== '/register.html') {
          window.location.href = '/login.html';
          return; // Stop processing
        }
      }

      // Handle other errors
      if (!response.ok) {
        let errorMessage = 'An error occurred';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText;
        }
        throw new Error(errorMessage);
      }

      // Return JSON if content-type is json, otherwise return text or blob?
      // For now, assume JSON for this app's API
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return response; // Return raw response if not JSON
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  },

  /**
   * GET request
   */
  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  /**
   * POST request
   */
  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * PUT request
   */
  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /**
   * DELETE request
   */
  delete(endpoint, body, options = {}) {
    const config = { ...options, method: 'DELETE' };
    if (body) {
      config.body = JSON.stringify(body);
    }
    return this.request(endpoint, config);
  },
};

// Make available globally
window.apiClient = apiClient;
