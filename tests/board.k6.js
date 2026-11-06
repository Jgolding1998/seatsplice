import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const tokens = JSON.parse(__ENV.CREWBOARD_BENCH_TOKENS);

export const options = {
  scenarios: {
    board: {
      executor: 'constant-vus',
      vus: 100,
      duration: '20s',
      gracefulStop: '5s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate==0'],
    checks: ['rate==1']
  }
};

export default function () {
  const response = http.get(__ENV.CREWBOARD_BENCH_URL + '/api/board', {
    headers: { Cookie: `crewboard_session=${tokens[exec.vu.idInTest - 1]}` }
  });
  check(response, {
    'board responds with 12 teams and a cursor': res =>
      res.status === 200 && res.json('teams').length === 12 && Boolean(res.json('nextCursor'))
  });
}
