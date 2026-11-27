import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 20 },
    { duration: '10s', target: 50 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://csm-api-gateway:8000/api/v1';
const PRODUCT_ID = __ENV.PRODUCT_ID || '3378aeb6-143a-4228-a455-403e933cef4c';

export default function () {
  // 1. GET /products
  const resProducts = http.get(`${BASE_URL}/products`);
  check(resProducts, {
    'GET /products status is 200': (r) => r.status === 200,
  });

  // 2. GET /branches/nearest (Haversine GPS)
  const resBranches = http.get(`${BASE_URL}/branches/nearest?lat=10.77196&lng=106.70014`);
  check(resBranches, {
    'GET /branches/nearest status is 200': (r) => r.status === 200,
  });

  // 3. GET /inventory/product/:id
  const resInventory = http.get(`${BASE_URL}/inventory/product/${PRODUCT_ID}`);
  check(resInventory, {
    'GET /inventory/product/:id status is 200': (r) => r.status === 200,
  });

  sleep(0.05);
}
