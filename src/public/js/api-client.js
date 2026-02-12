/**
 * API Client for centralized fetch operations
 * Handles common headers, error parsing, and auth redirection
 */
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
        } catch (e) {
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
