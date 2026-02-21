import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  // Proctoring States
  const [riskScore, setRiskScore] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes in seconds
  const [modelLoaded, setModelLoaded] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const webcamRef = useRef(null);
  const faceModelRef = useRef(null);
  const objectModelRef = useRef(null);
  const intervalRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load AI Models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await tf.ready();
        faceModelRef.current = await blazeface.load();
        objectModelRef.current = await cocoSsd.load();
        setModelLoaded(true);
        console.log('AI Models Loaded');
      } catch (err) {
        console.error('Error loading AI models:', err);
      }
    };
    loadModels();
  }, []);

  // Timer Logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleStopInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen & Tab Switching Enforcement
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateRisk('tab_switch', 20);
        showWarning('Tab switching detected! Risk score increased.');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        updateRisk('fullscreen_exit', 10);
      } else {
        setIsFullscreen(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Request fullscreen on mount
    document.documentElement.requestFullscreen().catch(() => {
      setIsFullscreen(false);
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // AI Monitoring Loop
  useEffect(() => {
    if (modelLoaded) {
      intervalRef.current = setInterval(runProctoring, 2000); // Check every 2 seconds
    }
    return () => clearInterval(intervalRef.current);
  }, [modelLoaded]);

  const runProctoring = async () => {
    if (
      typeof webcamRef.current !== 'undefined' &&
      webcamRef.current !== null &&
      webcamRef.current.video.readyState === 4
    ) {
      const video = webcamRef.current.video;

      // 1. Face Detection
      const predictions = await faceModelRef.current.estimateFaces(video, false);
      if (predictions.length === 0) {
        updateRisk('face_missing', 5);
        showWarning('Face not detected! Please look at the camera.');
      } else if (predictions.length > 1) {
        updateRisk('multiple_faces', 20);
        showWarning('Multiple faces detected! Only the candidate should be present.');
      }

      // 2. Object Detection
      const objects = await objectModelRef.current.detect(video);
      const forbiddenObjects = ['cell phone', 'remote', 'book', 'laptop'];
      objects.forEach(obj => {
        if (forbiddenObjects.includes(obj.class)) {
          updateRisk('object_detected', 15);
          showWarning(`Forbidden object detected: ${obj.class}`);
        }
      });
    }
  };

  const updateRisk = (type, increase) => {
    setRiskScore(prev => {
      const newScore = prev + increase;
      socketRef.current.emit('update-risk', { interviewId, type, riskIncrease: increase });
      return newScore;
    });
  };

  const showWarning = (msg) => {
    setWarnings(prev => [...prev.slice(-2), msg]); // Keep last 3 warnings
    setTimeout(() => setWarnings(prev => prev.filter(w => w !== msg)), 5000);
  };

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen();
  };

  // Socket & Speech Logic
  useEffect(() => {
    socketRef.current = io('http://localhost:5000');
    socketRef.current.emit('join-interview', { interviewId });

    socketRef.current.on('ai-response', (data) => {
      setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
      speakText(data.message);
    });

    socketRef.current.on('interview-terminated', (data) => {
      alert(`Interview Terminated: ${data.reason}`);
      navigate('/dashboard');
    });

    socketRef.current.on('error', (data) => {
      alert(data.message);
      if (data.message.includes('terminated')) navigate('/dashboard');
    });

    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessages(prev => [...prev, { role: 'user', text: transcript }]);
        socketRef.current.emit('user-message', { interviewId, message: transcript });
        setIsRecording(false);
      };

      recognitionRef.current.onerror = (event) => {
        setIsRecording(false);
        if (event.error !== 'no-speech') alert('Speech recognition error. Please try again.');
      };

      recognitionRef.current.onend = () => setIsRecording(false);
    }

    return () => {
      socketRef.current?.disconnect();
      window.speechSynthesis?.cancel();
    };
  }, [interviewId]);

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return alert('Speech recognition only works in Chrome');
    setIsRecording(true);
    try { recognitionRef.current.start(); } catch { setIsRecording(false); }
  };

  const handleStopInterview = async () => {
    try {
      await axios.post(`http://localhost:5000/api/interview/stop/${interviewId}`);
      window.speechSynthesis?.cancel();
      navigate('/dashboard');
    } catch {
      alert('Error stopping interview');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div style={styles.container}>

      {/* Fullscreen Warning Overlay */}
      {!isFullscreen && (
        <div style={styles.fullscreenWarning}>
          <h2>⚠️ Proctored Environment Warning</h2>
          <p>Please enable full screen mode to continue the interview.</p>
          <button style={styles.warningButton} onClick={enterFullscreen}>Enable Full Screen</button>
        </div>
      )}

      {/* Warnings Toast */}
      {warnings.length > 0 && (
        <div style={styles.warningToast}>
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}

      {/* TOP SECTION */}
      <div style={styles.interviewerSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <img
              src="https://cdn-icons-png.flaticon.com/512/2922/2922510.png"
              alt="interviewer"
              style={styles.interviewerImage}
            />
            <h2 style={styles.interviewerTitle}>AI Interviewer</h2>
          </div>
          <div>
            <h1 style={styles.headerTitle}>
              ⏱️ {formatTime(timeLeft)}
            </h1>
          </div>
        </div>
      </div>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span>Risk Score: {riskScore}</span>
        </div>
        <button style={styles.stopButton} onClick={handleStopInterview}>⛔ End Interview</button>
      </div>

      {/* CHAT WINDOW */}
      <div style={styles.chatContainer}>
        {messages.length === 0 && (
          <div style={styles.welcomeMessage}>Waiting for the AI interviewer to begin...</div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#4A90E2' : '#E3E7EA',
              color: msg.role === 'user' ? 'white' : '#333'
            }}
          >
            <div style={styles.messageSender}>
              {msg.role === 'user' ? '👤 You' : '🤖 AI Interviewer'}
            </div>
            <div style={styles.messageText}>{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* WEBCAM OVERLAY */}
      <div style={styles.webcamContainer}>
        <Webcam
          ref={webcamRef}
          audio={false}
          style={styles.webcam}
          screenshotFormat="image/jpeg"
        />
        <div style={{
          ...styles.riskIndicator,
          background: riskScore < 50 ? '#4CAF50' : riskScore < 80 ? '#FF9800' : '#F44336'
        }}>
          Risk: {riskScore}%
        </div>
      </div>

      {/* RECORDING CONTROLS */}
      <div style={styles.controls}>
        <p style={styles.instruction}>
          {isRecording ? '🎙️ Listening... speak now!' : 'Press the button and answer the question'}
        </p>
        <button
          style={{
            ...styles.recordButton,
            backgroundColor: isRecording ? '#E53935' : '#43A047'
          }}
          onClick={startRecording}
          disabled={isRecording}
        >
          {isRecording ? '🔴 Recording...' : '🎤 Start Speaking'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#F7F9FC',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative' // Needed for camera overlay
  },

  // ... (Keep existing styles)
  interviewerSection: {
    textAlign: 'center',
    padding: '10px 10px 5px',
    background: '#fff',
    borderBottom: '1px solid #ddd'
  },
  interviewerImage: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  },
  interviewerTitle: {
    fontSize: '18px',
    marginTop: '5px',
    fontWeight: '600'
  },
  interviewerSubtitle: {
    color: '#666',
    marginTop: '2px',
    fontSize: '12px'
  },

  header: {
    background: '#2196F3',
    color: 'white',
    padding: '10px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  headerTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  stopButton: {
    background: '#E53935',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer'
  },

  chatContainer: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  welcomeMessage: {
    textAlign: 'center',
    color: '#777',
    marginTop: '40px',
    fontSize: '17px'
  },

  message: {
    maxWidth: '75%',
    padding: '14px 18px',
    borderRadius: '12px',
    boxShadow: '0 3px 6px rgba(0,0,0,0.1)'
  },
  messageSender: {
    fontWeight: 'bold',
    fontSize: '14px',
    marginBottom: '6px'
  },
  messageText: {
    fontSize: '15px',
    lineHeight: '1.5'
  },

  controls: {
    background: 'white',
    padding: '15px',
    textAlign: 'center',
    borderTop: '1px solid #ddd'
  },
  instruction: {
    color: '#555',
    marginBottom: '10px'
  },
  recordButton: {
    padding: '12px 30px',
    border: 'none',
    borderRadius: '30px',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
  },

  // Proctoring Styles
  webcamContainer: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    width: '200px',
    height: '150px',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    border: '2px solid #fff',
    zIndex: 1000
  },
  webcam: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  riskIndicator: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    padding: '5px 10px',
    borderRadius: '5px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
    zIndex: 1001
  },
  fullscreenWarning: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.9)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    zIndex: 2000
  },
  warningButton: {
    marginTop: '20px',
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '5px'
  },
  timer: {
    background: '#333',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '5px',
    fontSize: '14px',
    fontFamily: 'monospace'
  },
  warningToast: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#ff9800',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '5px',
    zIndex: 1500,
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
  }
};

export default Interview;