async function test() {
  const res = await fetch('http://127.0.0.1:3000/api/players', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Password': 'cainiao'
    },
    body: JSON.stringify({id: 'test-user-post-1', name: 'Test Player Output'})
  });
  const data = await res.json();
  console.log('Post API returned:', data);
  if (data.success) {
    console.log('Successfully wrote test data, ID: test-user-post-1');
  } else {
    console.error('Failed to write data:', data);
  }
}
test();
