import React, { useState, useEffect, useCallback } from 'https://unpkg.com/react@18.2.0/umd/react.production.min.js';
import { createRoot } from 'https://unpkg.com/react-dom@18.2.0/client/index.js'; // Corrected import for createRoot
// Updated imports to use CDN URLs for Tiptap and Y.js related libraries
import { useEditor, EditorContent } from 'https://unpkg.com/@tiptap/react@2.2.4/dist/tiptap-react.esm.js';
import StarterKit from 'https://unpkg.com/@tiptap/starter-kit@2.2.4/dist/tiptap-starter-kit.esm.js';
import Collaboration from 'https://unpkg.com/@tiptap/extension-collaboration@2.2.4/dist/tiptap-extension-collaboration.esm.js';
import CollaborationCursor from 'https://unpkg.com/@tiptap/extension-collaboration-cursor@2.2.4/dist/tiptap-extension-collaboration-cursor.esm.js';
import * as Y from 'https://unpkg.com/yjs@13.6.13/dist/y.esnext.js';
import { WebsocketProvider } from 'https://unpkg.com/y-websocket@1.5.0/dist/y-websocket.esnext.js';

import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Ensure __app_id, __firebase_config, and __initial_auth_token are defined in the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase (only once)
let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Fallback or error display if Firebase fails to initialize
}

// Function to generate a random color for user cursors
const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

// Main App component
const App = () => {
  const [userId, setUserId] = useState(null);
  const [ydoc, setYdoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [roomName, setRoomName] = useState('default-room'); // Default room name
  const [tempRoomInput, setTempRoomInput] = useState('default-room'); // For input field

  // Authenticate with Firebase and set user ID
  useEffect(() => {
    const authenticateUser = async () => {
      try {
        if (auth) {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
          onAuthStateChanged(auth, (user) => {
            if (user) {
              setUserId(user.uid);
              console.log("Authenticated user ID:", user.uid);
            } else {
              console.log("No user is signed in.");
              // Fallback for unauthenticated users (e.g., generate a random ID)
              setUserId(crypto.randomUUID());
            }
          });
        } else {
          // If Firebase auth isn't initialized, generate a random ID
          setUserId(crypto.randomUUID());
          console.warn("Firebase Auth not initialized, using random user ID.");
        }
      } catch (error) {
        console.error("Firebase authentication error:", error);
        // Fallback to a random ID if authentication fails
        setUserId(crypto.randomUUID());
      }
    };

    authenticateUser();
  }, []); // Run only once on component mount

  // Initialize Y.js document and WebSocket provider when userId and roomName are available
  useEffect(() => {
    if (userId && roomName) {
      // Clean up previous provider if changing rooms
      if (provider) {
        provider.destroy();
        console.log("Previous Y-WebSocket provider destroyed.");
      }
      if (ydoc) {
        ydoc.destroy();
        console.log("Previous Ydoc destroyed.");
      }

      const newYdoc = new Y.Doc();
      // Connect to the WebSocket server. Replace 'ws://localhost:1234' with your backend URL.
      // For Canvas, it's often 'ws://localhost:8080' or a specific port.
      // Make sure your backend server is running and accessible.
      const newProvider = new WebsocketProvider(
        'ws://localhost:1234', // IMPORTANT: Change this to your WebSocket server URL
        roomName,
        newYdoc,
        { connect: true }
      );

      setYdoc(newYdoc);
      setProvider(newProvider);
      console.log(`Y.js document and provider initialized for room: ${roomName}`);

      // Optional: Log connection status
      newProvider.on('status', event => {
        console.log(`WebSocket status for room ${roomName}:`, event.status); // 'connecting', 'connected', 'disconnected'
      });

      return () => {
        // Cleanup on unmount or room change
        newProvider.destroy();
        newYdoc.destroy();
        console.log(`Y.js document and provider for room ${roomName} destroyed on cleanup.`);
      };
    }
  }, [userId, roomName]); // Re-run if userId or roomName changes

  // Tiptap editor setup
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Y.js handles history
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: userId ? `User-${userId.substring(0, 8)}` : 'Anonymous', // Display first 8 chars of UID
          color: getRandomColor(), // Random color for cursor
        },
      }),
    ],
    content: '', // Initial content (Y.js will sync it)
    onUpdate: ({ editor }) => {
      // You can add custom logic here if needed, e.g., saving content to a database
      // However, Y.js handles the real-time sync automatically.
    },
    // Only initialize editor when ydoc and provider are ready
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none p-4',
      },
    },
    autofocus: true,
  }, [ydoc, provider]); // Re-initialize editor when ydoc or provider changes

  // Function to copy room ID to clipboard
  const copyRoomIdToClipboard = useCallback(() => {
    if (roomName) {
      // Using a temporary textarea for clipboard access in iframes
      const el = document.createElement('textarea');
      el.value = roomName;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      console.log(`Room ID "${roomName}" copied to clipboard!`);
      // Using alert for simplicity, replace with custom modal as per instructions
      alert(`Room ID "${roomName}" copied to clipboard!`);
    }
  }, [roomName]);

  // Handle room change
  const handleRoomChange = () => {
    if (tempRoomInput.trim() !== '') {
      setRoomName(tempRoomInput.trim());
    }
  };

  // Render loading state until editor is ready
  if (!editor || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-lg font-semibold text-gray-700">Loading collaborative editor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-inter flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl bg-white shadow-lg rounded-lg p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4 text-center">
          Real-Time Collaborative Editor
        </h1>

        <div className="mb-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <label htmlFor="room-input" className="text-gray-700 font-medium whitespace-nowrap">
            Current Room:
          </label>
          <input
            id="room-input"
            type="text"
            value={tempRoomInput}
            onChange={(e) => setTempRoomInput(e.target.value)}
            className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm text-gray-800"
            placeholder="Enter room name"
          />
          <button
            onClick={handleRoomChange}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition duration-200 ease-in-out"
          >
            Join Room
          </button>
          <button
            onClick={copyRoomIdToClipboard}
            className="px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition duration-200 ease-in-out"
          >
            Copy Room ID
          </button>
        </div>

        {userId && (
          <div className="text-sm text-gray-600 mb-4 text-center">
            Your User ID: <span className="font-mono text-blue-700">{userId}</span>
          </div>
        )}

        <div className="border border-gray-300 rounded-lg overflow-hidden min-h-[400px] shadow-inner">
          <EditorContent editor={editor} className="h-full" />
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          Start typing! Your changes will be synchronized in real-time with others in the same room.
        </div>
      </div>
    </div>
  );
};

// Render the App component
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

// Tailwind CSS CDN (ensure this is loaded in your HTML if not already)
// <script src="https://cdn.tailwindcss.com"></script>
// Google Fonts (Inter)
// <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
