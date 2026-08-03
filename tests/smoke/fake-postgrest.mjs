import { createServer } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';

const port = Number(process.env.FAKE_POSTGREST_PORT ?? '3001');
const expectedServiceKey = process.env.FAKE_SERVICE_ROLE_KEY ?? 'smoke-service-role-key';

const profile = {
  id: 'profile-smoke',
  name: 'Smoke',
  blessing_path_id: 'bastion',
  blessing_budget: 4,
  blessing_ranks: {},
  skill_slots: [null, null, null],
  gem_slots: [null, null, null],
  is_default: true,
  is_active: true,
};

createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.headers.apikey !== expectedServiceKey) {
    response.writeHead(401).end(JSON.stringify({ message: 'service role required' }));
    return;
  }
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (request.method === 'GET' && url.pathname === '/meta_character_profiles') {
    response.writeHead(200).end(JSON.stringify([profile]));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/meta_owned_skills') {
    response.writeHead(200).end('[]');
    return;
  }
  response.writeHead(404).end(JSON.stringify({ message: 'not found' }));
}).listen(port, '127.0.0.1');
