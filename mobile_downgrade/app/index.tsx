import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Button,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StreamStatus = 'idle' | 'streaming' | 'error';

const CAPTURE_OPTIONS = {
  quality: 0.6,
  base64: false,
  skipProcessing: true,
  shutterSound: false,
  imageType: 'jpg' as const,
  pictureSize: '640x480',
};

export default function HomeScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isForeground, setIsForeground] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [displayFps, setDisplayFps] = useState(0);
  const [lastError, setLastError] = useState('');
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [host, setHost] = useState('192.168.0.10');
  const [port, setPort] = useState('8080');

  const hostRef = useRef(host);
  const portRef = useRef(port);
  const flipHRef = useRef(flipH);
  const flipVRef = useRef(flipV);
  const sentTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    hostRef.current = host;
  }, [host]);
  useEffect(() => {
    portRef.current = port;
  }, [port]);
  useEffect(() => {
    flipHRef.current = flipH;
  }, [flipH]);
  useEffect(() => {
    flipVRef.current = flipV;
  }, [flipV]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setIsForeground(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isForeground && isStreaming) {
      setIsStreaming(false);
      setStatus('idle');
      setStatusText('Paused (app in background)');
    }
  }, [isForeground, isStreaming]);

  useEffect(() => {
    if (!isStreaming || !isForeground) {
      return;
    }

    let stopped = false;

    const fpsTicker = setInterval(() => {
      const now = Date.now();
      sentTimestampsRef.current = sentTimestampsRef.current.filter((t) => now - t <= 2000);
      setDisplayFps(sentTimestampsRef.current.length / 2.0);
    }, 500);

    const streamLoop = async () => {
      while (!stopped) {
        if (!cameraRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
        try {
          const picture = await cameraRef.current.takePictureAsync(CAPTURE_OPTIONS);
          if (!picture?.uri) {
            continue;
          }

          const imageResponse = await fetch(picture.uri);
          const blob = await imageResponse.blob();
          const url = `http://${hostRef.current.trim()}:${portRef.current.trim()}/frame`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'image/jpeg',
              'X-Flip-H': flipHRef.current ? '1' : '0',
              'X-Flip-V': flipVRef.current ? '1' : '0',
            },
            body: blob,
          });

          if (!response.ok) {
            throw new Error(`Bridge ${response.status}`);
          }

          sentTimestampsRef.current.push(Date.now());
          setStatus('streaming');
          setStatusText('Streaming');
          setLastError('');
        } catch (error) {
          setStatus('error');
          setStatusText('Stream error');
          setLastError(error instanceof Error ? error.message : 'Upload error');
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    };

    void streamLoop();

    return () => {
      stopped = true;
      clearInterval(fpsTicker);
    };
  }, [isForeground, isStreaming]);

  const canStream = useMemo(() => {
    return host.trim().length > 0 && port.trim().length > 0;
  }, [host, port]);

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.label}>Use iOS or Android device (Expo Go) for camera streaming.</Text>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.label}>Loading camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.label}>Camera permission is required.</Text>
        <View style={styles.permissionButton}>
          <Button title="Grant camera permission" onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.previewContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.preview}
          facing="back"
          mute
          videoStabilizationMode="off"
        />
        <View style={styles.overlay}>
          <Text style={styles.overlayFps}>{displayFps.toFixed(1)} fps</Text>
          <Text style={styles.overlayStatus}>{statusText}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={16}>
        <View style={styles.controlsShell}>
          <View style={styles.endpointRow}>
            <TextInput
              style={[styles.input, styles.hostInput]}
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="PC IP"
              placeholderTextColor="#777"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.input, styles.portInput]}
              value={port}
              onChangeText={setPort}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Port"
              placeholderTextColor="#777"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.quickRow}>
            <Pressable
              style={[styles.pillButton, flipH && styles.pillButtonActive]}
              onPress={() => setFlipH((v) => !v)}>
              <Text style={styles.pillText}>Flip H {flipH ? 'On' : 'Off'}</Text>
            </Pressable>
            <Pressable
              style={[styles.pillButton, flipV && styles.pillButtonActive]}
              onPress={() => setFlipV((v) => !v)}>
              <Text style={styles.pillText}>Flip V {flipV ? 'On' : 'Off'}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.streamButton,
              !canStream && styles.buttonDisabled,
              isStreaming && styles.streamButtonStop,
            ]}
            disabled={!canStream}
            onPress={() => {
              const next = !isStreaming;
              setIsStreaming(next);
              if (!next) {
                setStatus('idle');
                setStatusText('Stopped');
                setDisplayFps(0);
              } else {
                setStatus('streaming');
                setStatusText('Starting...');
              }
            }}>
            <Text style={styles.buttonText}>{isStreaming ? 'Stop' : 'Start Streaming'}</Text>
          </Pressable>

          {status === 'error' && lastError.length > 0 ? (
            <Text style={styles.errorText}>Error: {lastError}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#111111',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  preview: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  overlayFps: {
    color: '#00ff66',
    fontSize: 22,
    fontWeight: '800',
  },
  overlayStatus: {
    color: '#dddddd',
    fontSize: 12,
  },
  label: {
    color: '#f2f2f2',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#3d3d3d',
    borderRadius: 10,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hostInput: {
    flex: 3,
  },
  portInput: {
    flex: 1,
  },
  buttonDisabled: {
    backgroundColor: '#606060',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  errorText: {
    color: '#ff8080',
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 12,
  },
  controlsShell: {
    backgroundColor: '#171717',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  endpointRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#3d3d3d',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pillButtonActive: {
    backgroundColor: '#2e5f43',
    borderColor: '#4da66f',
  },
  pillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  streamButton: {
    borderRadius: 14,
    backgroundColor: '#0f8f4a',
    paddingVertical: 16,
    alignItems: 'center',
  },
  streamButtonStop: {
    backgroundColor: '#a23737',
  },
});
