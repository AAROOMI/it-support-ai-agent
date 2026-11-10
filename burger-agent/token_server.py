import json
import os
import random
from http.server import HTTPServer, BaseHTTPRequestHandler
from livekit.api import AccessToken, VideoGrants
from livekit.protocol import room as room_proto
from livekit.protocol.agent_dispatch import RoomAgentDispatch

env = {}
for line in open('/Users/abdullahroomi/Desktop/untitled folder/test141/burger-agent/.env.local'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip(chr(34))

API_KEY = env['LIVEKIT_API_KEY']
API_SECRET = env['LIVEKIT_API_SECRET']
LIVEKIT_URL = env['LIVEKIT_URL']


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/connection-details'):
            room_name = 'burger_room_' + str(random.randint(1000, 9999))
            participant_identity = 'customer_' + str(random.randint(1000, 9999))
            at = AccessToken(API_KEY, API_SECRET)
            at.with_identity(participant_identity).with_name('customer')
            grant = VideoGrants(room_join=True, room=room_name, can_publish=True, can_publish_data=True, can_subscribe=True)
            at.with_grants(grant)
            at.with_room_config(room_proto.RoomConfiguration(agents=[RoomAgentDispatch(agent_name='burger-agent')]))
            token = at.to_jwt()
            resp = json.dumps({
                'serverUrl': LIVEKIT_URL,
                'roomName': room_name,
                'participantToken': token,
                'participantName': 'customer',
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass


print('Token server running on http://localhost:8765')
HTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
