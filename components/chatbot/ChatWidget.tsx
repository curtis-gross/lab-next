import { useState, useRef, useEffect } from 'react';
import { GeminiLiveClient } from '../../lib/gemini';
import './ChatWidget.css';

// Tool Definitions
const TOOLS = [
  {
    name: "validate_identity",
    description: "Validate user identity with name and SSN. ONLY use this for Password Resets.",
    parameters: {
      type: "OBJECT",
      properties: {
        full_name: { type: "STRING" },
        ssn_last_4: { type: "STRING" }
      },
      required: ["full_name", "ssn_last_4"]
    }
  },
  {
    name: "request_camera",
    description: "Request the user to turn on their camera for ID verification.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "complete_verification",
    description: "Complete the verification process after ID is shown.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "request_screen_share",
    description: "Request the user to share their screen to guide them through a process.",
    parameters: { type: "OBJECT", properties: {} }
  }
];

type WorkflowType = 'password_reset' | '401k_contribution' | null;

type DebugLog = {
  timestamp: string;
  type: string;
  message: string;
};

export default function ChatWidget({ customerContextData }: { customerContextData?: any }) {
  const [apiKey, setApiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Avatar State
  const [isVideoActive, setIsVideoActive] = useState(false);

  // Persisted Chat State
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([]);

  // Workflow State
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>(null);
  const [workflowStep, setWorkflowStep] = useState(0);

  // Debug State
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Persistence Fetch
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const res = await fetch('/api/load-run/chat_widget');
        if (res.ok) {
          const data = await res.json();
          if (data) {
            if (data.apiKey) setApiKey(data.apiKey);
            if (data.isExpanded !== undefined) setIsExpanded(data.isExpanded);
            if (data.messages) setMessages(data.messages);
            if (data.activeWorkflow) setActiveWorkflow(data.activeWorkflow);
            if (data.workflowStep !== undefined) setWorkflowStep(data.workflowStep);
            if (data.debugLogs) setDebugLogs(data.debugLogs);
          }
        }
      } catch (e) {
        console.error("Failed to load chat widget state", e);
      }
    };

    loadSavedState();

    fetch('/api/key')
      .then(res => res.json())
      .then(data => {
        if (data.apiKey && data.apiKey !== '') setApiKey(data.apiKey);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save State Function
  const saveState = (updates: any) => {
    const currentState = {
      apiKey,
      isExpanded,
      messages,
      activeWorkflow,
      workflowStep,
      debugLogs,
      ...updates
    };

    fetch('/api/save-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        featureId: 'chat_widget',
        data: currentState
      })
    }).catch(err => console.error("Failed to save chat widget state:", err));
  };

  useEffect(() => {
    if (apiKey) saveState({ apiKey });
  }, [apiKey]);

  useEffect(() => {
    saveState({ isExpanded });
  }, [isExpanded]);

  useEffect(() => {
    if (messages.length > 0) saveState({ messages });
  }, [messages]);

  useEffect(() => {
    saveState({ activeWorkflow });
  }, [activeWorkflow]);

  useEffect(() => {
    saveState({ workflowStep });
  }, [workflowStep]);

  useEffect(() => {
    if (debugLogs.length > 0) saveState({ debugLogs });
  }, [debugLogs]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  const addDebugLog = (type: string, message: string) => {
    const log = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setDebugLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  const handleConnect = async () => {
    if (!apiKey) {
      alert('Please enter your Gemini API Key');
      return;
    }

    addDebugLog('Connection', 'Initiating connection...');
    setConnectionError(null);

    const dynamicContext = customerContextData ? `\n\nCRITICAL USER CONTEXT (USE THIS TO ANSWER SPECIFIC QUESTIONS ABOUT THEIR PLAN):\n${JSON.stringify(customerContextData, null, 2)}` : '';

    const client = new GeminiLiveClient({
      apiKey,
      systemInstruction: `You are a Healthco Concierge Director, designed to help agents expertly handle client requests for health insurance, plan details, and wellness programs.${dynamicContext}

      YOUR CORE RESPONSIBILITIES:
      1. Provide accurate, clear, and professional guidance on Healthco plans, benefits, and coverage.
      2. Answer agent questions related to the client's profile, recent claims, and health goals to prep them for the call.
      3. Proactively suggest health and wellness recommendations based on the client's profile.

      GENERAL RULES:
      - Maintain a supportive, expert, and professional tone at all times.
      - Do not mention any internal technical tools or constraints.
      - Perform actions naturally, as a human health concierge director would.`,
      tools: TOOLS
    }, (msg) => {
      if (msg.type === 'connected') {
        setIsConnected(true);
        setStatus('Listening');
        addDebugLog('Connection', 'Connected successfully');
      } else if (msg.type === 'disconnected') {
        setIsConnected(false);
        setStatus('Disconnected');
        addDebugLog('Connection', 'Disconnected');
      } else if (msg.type === 'tool_call') {
        handleToolCall(msg.data);
      } else if (msg.type === 'error') {
        const errorMsg = msg.error || 'Unknown error';
        addDebugLog('Error', errorMsg);
        setConnectionError(errorMsg);
      } else if (msg.type === 'audio_debug') {
        addDebugLog('Audio', msg.message);
      }
    });

    clientRef.current = client;
    await client.connect();
  };

  const handleToolCall = async (toolCall: any) => {
    const calls = toolCall.functionCalls;
    const results = [];

    addDebugLog('Tool Call Received', JSON.stringify(calls));

    for (const call of calls) {
      let result = {};

      if (call.name === 'validate_identity') {
        setActiveWorkflow('password_reset');
        setWorkflowStep(1);
        result = { valid: true };
        setMessages(prev => [...prev, { role: 'system', text: `Identity Validated: ${call.args.full_name}` }]);
        addDebugLog('Tool Action', `Validated identity for ${call.args.full_name}`);
      } else if (call.name === 'request_camera') {
        setActiveWorkflow('password_reset');
        setWorkflowStep(2);
        result = { status: 'requested' };
        setMessages(prev => [...prev, { role: 'system', text: 'Camera Requested' }]);
        addDebugLog('Tool Action', 'Requesting camera access');
      } else if (call.name === 'complete_verification') {
        setActiveWorkflow('password_reset');
        setWorkflowStep(3);
        result = { status: 'success' };
        setMessages(prev => [...prev, { role: 'system', text: 'Verification Complete' }]);
        addDebugLog('Tool Action', 'Verification completed successfully');
      } else if (call.name === 'request_screen_share') {
        setActiveWorkflow('401k_contribution');
        setWorkflowStep(2);
        result = { status: 'requested' };
        setMessages(prev => [...prev, { role: 'system', text: 'Screen Share Requested' }]);
        addDebugLog('Tool Action', 'Requesting screen share');
      }

      results.push({
        functionCall: {
          name: call.name,
          result: result,
          id: call.id
        }
      });
    }

    addDebugLog('Tool Response', `Sending response for ${results.length} calls`);
    clientRef.current?.sendToolResponse(results);
  };

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setStatus('Idle');
    addDebugLog('Connection', 'User disconnected session');
    clearSession();
  };

  const clearSession = () => {
    setMessages([]);
    setDebugLogs([]);
    saveState({
      messages: [],
      activeWorkflow: null,
      workflowStep: 0,
      debugLogs: []
    });
    addDebugLog('System', 'Session cleared');
  };

  const enableScreenShare = async () => {
    addDebugLog('User Action', 'Enabling screen share');
    if (clientRef.current) {
      const stream = await clientRef.current.startScreenShare();
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsVideoActive(true);
        if (activeWorkflow === '401k_contribution') {
          setWorkflowStep(3);
          addDebugLog('Workflow', 'Screen share active, advancing to step 3');
        }
      }
    }
  };

  return (
    <div className={`chat-widget-container ${isExpanded ? 'expanded' : 'collapsed'}`} style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
      {!isExpanded ? (
        <button className="chat-bubble-btn" onClick={toggleExpand}>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/500px-Google_Gemini_icon_2025.svg.png"
            alt="E*Trade Agent"
            className="bubble-icon"
            style={{ width: '40px', height: '40px', objectFit: 'contain' }}
          />
        </button>
      ) : (
        <>
          <header className="chat-widget-header" style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <div className="logo-area">
              <span className="font-bold text-gray-900 text-lg tracking-widest uppercase">Healthco Concierge</span>
            </div>
            <div className="header-controls">
              <button
                className={`debug-btn ${showDebug ? 'active' : ''}`}
                onClick={toggleDebug}
                title="Toggle Debug Log"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', color: showDebug ? '#B80000' : '#6b7280', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8 2 1.88 1.88" />
                  <path d="M14.12 3.88 16 2" />
                  <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                  <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                  <path d="M12 20v-9" />
                  <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                  <path d="M6 13H2" />
                  <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                  <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                  <path d="M22 13h-4" />
                  <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
                </svg>
              </button>
              <div className={`status-dot ${isConnected ? 'connected' : ''}`} title={status}></div>
              <button className="minimize-btn" onClick={toggleExpand} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', color: '#6b7280' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </header>

          <main className="chat-widget-main" style={{ position: 'relative' }}>
            {showDebug && (
              <div className="debug-panel" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '200px',
                backgroundColor: 'rgba(0,0,0,0.85)',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: '10px',
                overflowY: 'auto',
                padding: '10px',
                zIndex: 100,
                borderBottom: '1px solid #333'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', borderBottom: '1px solid #333' }}>
                  <strong>DEBUG LOG</strong>
                  <button onClick={clearSession} style={{ background: 'transparent', border: '1px solid #555', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>Clear Session</button>
                </div>
                {debugLogs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <span style={{ color: '#888' }}>[{log.timestamp}]</span> <strong style={{ color: '#fff' }}>{log.type}:</strong> {log.message}
                  </div>
                ))}
                {debugLogs.length === 0 && <div>No logs yet.</div>}
              </div>
            )}

            {!isConnected && messages.length === 0 ? (
              <div className="setup-screen">
                <p className="description" style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
                  Elevated AI health preparation and insights for Healthco Concierge.
                </p>
                {(!apiKey || apiKey.trim() === '') && (
                  <input
                    type="password"
                    placeholder="Enter Gemini API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="api-input"
                    style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                )}

                <button className="connect-btn" onClick={handleConnect} style={{ width: '100%', backgroundColor: '#0a42a0', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
                  Connect Agent
                </button>
                {status === 'Error' && (
                  <div className="error-message" style={{ color: 'red', marginTop: '10px', fontSize: '12px', textAlign: 'center' }}>
                    {connectionError || 'Connection failed. Check console.'}
                  </div>
                )}
              </div>
            ) : (
              <div className="active-session">
                {!isConnected && (
                  <div className="reconnect-banner" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '8px', borderRadius: '4px', fontSize: '12px', textAlign: 'center', marginBottom: '10px' }}>
                    {connectionError ? (
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{connectionError}</div>
                    ) : (
                      <span>Session Disconnected. </span>
                    )}
                    <button onClick={handleConnect} style={{ background: 'transparent', border: 'underline', cursor: 'pointer', fontWeight: 'bold', color: 'inherit' }}>Reconnect</button>
                  </div>
                )}

                <div className="visualizer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                  <div className={`pulse ${status === 'Listening' ? 'active' : ''}`} style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: status === 'Listening' ? '#0a42a0' : '#ccc', marginBottom: '10px', transition: 'all 0.3s' }}></div>
                  <div className="status-text" style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>{status}</div>
                </div>

                {isVideoActive && (
                  <div className="video-preview" style={{ width: '100%', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden' }}>
                    <video ref={videoRef} muted playsInline className="preview-video" style={{ width: '100%', height: 'auto' }} />
                  </div>
                )}

                <div className="actions-grid" style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                  <div className="quick-buttons" style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={enableScreenShare} style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}>
                      🖥️ Share Screen
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <button className="disconnect-btn" onClick={handleDisconnect} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
                    End Session
                  </button>
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
