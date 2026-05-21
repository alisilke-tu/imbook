import Client, { Local } from "./client.ts";

/**
 * Returns the generated Encore request client for either the local or staging environment.
 * If we are running the frontend locally (development) we assume that our Encore
 * backend is also running locally.
 */
const getRequestClient = (token: string | undefined) => {
  let apiUrl: string = import.meta.env.VITE_API_URL || Local;

  // Support relative URLs (e.g. /api) for Vercel proxy setups
  if (apiUrl.startsWith('/')) {
    apiUrl = window.location.origin + apiUrl;
  }

  return new Client(apiUrl, {
    auth: token,
  });
};

export default getRequestClient;
