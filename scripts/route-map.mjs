import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;
http.get(ORIGIN + '/api/status?t=' + Date.now(), res => {
  console.log('status:', res.statusCode);
  res.resume();
});
