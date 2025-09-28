// API utility functions
export const getBackendUrl = (): string => {
  // Use environment variable if available, otherwise fallback to localhost for development
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
};

export const apiCall = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const baseUrl = getBackendUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };
  
  return fetch(url, defaultOptions);
};
