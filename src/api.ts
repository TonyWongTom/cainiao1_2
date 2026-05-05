const API_BASE = '/api';

export const fetchPlayers = async () => {
  const response = await fetch(`${API_BASE}/players`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

export default API_BASE;
