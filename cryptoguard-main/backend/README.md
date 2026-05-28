# Dark Mode PQC Backend

MongoDB-backed backend for the Dark Mode PQC Dashboard.

Endpoints:
- `GET /health` - health check
- `POST /api/audit` - accepts JSON `{ "url": "example.com" }` and returns a live PQC audit result

Required environment:

```powershell
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=darkmode_pqc
```

Run locally:

```powershell
cd backend
npm install
npm start
```

The server seeds the current JSON data into MongoDB if the collections are empty.

Frontend integration:
- Send `Authorization: Bearer dev_local_key_please_change`
- POST to `http://localhost:4000/api/audit` (or the port you set)
