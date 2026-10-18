import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ten_users: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10s',
      startTime: '0s',
    },
    fifty_users: {
      executor: 'constant-vus',
      vus: 50,
      duration: '10s',
      startTime: '12s',
    },
    hundred_users: {
      executor: 'constant-vus',
      vus: 100,
      duration: '10s',
      startTime: '24s',
    },
  },
  thresholds: {
    // Không có lỗi 500
    'http_req_failed{status:500}': ['rate==0'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://csm-api-gateway:8000/api/v1';
const PRODUCT_ID = __ENV.PRODUCT_ID || '3378aeb6-143a-4228-a455-403e933cef4c';
const BRANCH_ID = __ENV.BRANCH_ID || 'br-01';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const payload = JSON.stringify({
    branchId: BRANCH_ID,
    shippingAddress: 'Benchmark k6 Test Address',
    paymentMethod: 'COD',
    items: [
      {
        productId: PRODUCT_ID,
        quantity: 1,
      },
    ],
  });

  const headers = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const res = http.post(`${BASE_URL}/orders`, payload, { headers });

  check(res, {
    'Status is 201 Created or 400 OutOfStock': (r) => r.status === 201 || r.status === 400,
    'No 500 Server Error': (r) => r.status !== 500,
  });

  sleep(0.1);
}
