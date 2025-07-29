// server.js
const WebSocket = require('ws');
const Y = require('yjs'); // Import yjs
// Removed: const { readSync, writeSync } = require('y-websocket/bin/utils'); // This line caused the error

const wss = new WebSocket.Server({ port: 1234 }); // Listen on port 1234

// Map to store Y.Doc instances for each room
const docs = new Map();

wss.on('connection', (ws, req) => {
  // Extract the room name from the URL path, e.g., ws://localhost:1234/my-room
  const roomName = req.url.slice(1); // Remove the leading '/'

  if (!roomName) {
    console.warn('Client connected without a room name. Closing connection.');
    ws.close();
    return;
  }

  console.log(`Client connected to room: ${roomName}`);

  // Get or create the Y.Doc for this room
  if (!docs.has(roomName)) {
    docs.set(roomName, new Y.Doc());
    console.log(`Created new Y.Doc for room: ${roomName}`);
  }
  const ydoc = docs.get(roomName);

  // Send the current state of the document to the newly connected client
  ws.send(Y.encodeStateAsUpdate(ydoc));

  // Listen for updates from the Y.Doc and broadcast them to all clients in this room
  const updateHandler = (update, origin) => {
    // Only broadcast updates that didn't originate from this specific WebSocket connection
    // This prevents echoing updates back to the sender
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== origin) {
        client.send(update);
      }
    });
  };
  ydoc.on('update', updateHandler);

  // Listen for messages (Y.js updates) from the client
  ws.on('message', message => {
    try {
      // Apply the update from the client to the Y.Doc
      Y.applyUpdate(ydoc, message, ws); // Pass `ws` as origin to prevent echoing back to sender
    } catch (error) {
      console.error(`Error applying Y.js update in room ${roomName}:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected from room: ${roomName}`);
    // Remove the update handler when the client disconnects
    ydoc.off('update', updateHandler);

    // Optional: If no clients are left in a room, you might want to destroy the Y.Doc
    // to free up memory, but this would lose its state if not persisted.
    // For now, we keep it in memory.
    let clientsInRoom = 0;
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.roomName === roomName) {
        clientsInRoom++;
      }
    });
    if (clientsInRoom === 0) {
      // console.log(`No more clients in room ${roomName}, considering destroying Y.Doc (not doing for now)`);
      // ydoc.destroy(); // Uncomment if you want to clear doc when room is empty
      // docs.delete(roomName);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error in room ${roomName}:`, error);
  });

  // Attach roomName to the WebSocket connection object for easier tracking
  ws.roomName = roomName;
});

console.log('WebSocket server started on ws://localhost:1234');
console.log('Connect clients to rooms like ws://localhost:1234/your-room-name');
