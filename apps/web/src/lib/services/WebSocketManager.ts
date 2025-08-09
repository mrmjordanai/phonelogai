/**
 * WebSocket Manager for Real-time Communication
 * Handles WebSocket connections, rooms, and event broadcasting
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { createClient } from '@phonelogai/database';

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  userId: string;
  orgId: string;
  rooms: Set<string>;
  lastHeartbeat: Date;
}

export interface WebSocketMessage {
  type: string;
  channel?: string;
  data: any;
  timestamp: Date;
}

export interface BroadcastOptions {
  room?: string;
  userId?: string;
  orgId?: string;
  exclude?: string; // Client ID to exclude
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // room -> client IDs
  private heartbeatInterval: NodeJS.Timeout;

  constructor(server?: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/ws',
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Extract authentication token from query parameters or headers
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || 
                   request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET || '') as any;
      const userId = decoded.sub;

      if (!userId) {
        ws.close(1008, 'Invalid token');
        return;
      }

      // Get user's organization
      const supabase = createClient();
      const { data: orgRole, error } = await supabase
        .from('org_roles')
        .select('org_id, role')
        .eq('user_id', userId)
        .single();

      if (error || !orgRole) {
        ws.close(1008, 'User not found in organization');
        return;
      }

      // Create client record
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        userId,
        orgId: orgRole.org_id,
        rooms: new Set(),
        lastHeartbeat: new Date(),
      };

      this.clients.set(clientId, client);

      // Auto-join user to their personal room and org room
      this.joinRoom(clientId, `user:${userId}`);
      this.joinRoom(clientId, `org:${orgRole.org_id}`);

      // Set up message handlers
      ws.on('message', (message) => {
        this.handleMessage(clientId, message);
      });

      ws.on('close', () => {
        this.handleDisconnection(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket client error for ${clientId}:`, error);
        this.handleDisconnection(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        data: {
          clientId,
          userId,
          orgId: orgRole.org_id,
          rooms: Array.from(client.rooms),
        },
        timestamp: new Date(),
      });

      console.log(`WebSocket client connected: ${clientId} (user: ${userId})`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  private handleMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const parsedMessage = JSON.parse(message.toString());
      
      switch (parsedMessage.type) {
        case 'heartbeat':
          client.lastHeartbeat = new Date();
          this.sendToClient(clientId, {
            type: 'heartbeat_ack',
            data: { timestamp: new Date() },
            timestamp: new Date(),
          });
          break;

        case 'join_room':
          if (parsedMessage.room) {
            this.joinRoom(clientId, parsedMessage.room);
          }
          break;

        case 'leave_room':
          if (parsedMessage.room) {
            this.leaveRoom(clientId, parsedMessage.room);
          }
          break;

        case 'subscribe_job':
          if (parsedMessage.jobId) {
            this.joinRoom(clientId, `job:${parsedMessage.jobId}`);
          }
          break;

        case 'unsubscribe_job':
          if (parsedMessage.jobId) {
            this.leaveRoom(clientId, `job:${parsedMessage.jobId}`);
          }
          break;

        default:
          console.warn(`Unknown message type: ${parsedMessage.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove client from all rooms
    client.rooms.forEach(room => {
      this.leaveRoom(clientId, room);
    });

    // Remove client
    this.clients.delete(clientId);

    console.log(`WebSocket client disconnected: ${clientId}`);
  }

  /**
   * Join a client to a room
   */
  public joinRoom(clientId: string, room: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    // Add client to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
    client.rooms.add(room);

    this.sendToClient(clientId, {
      type: 'room_joined',
      data: { room },
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Remove a client from a room
   */
  public leaveRoom(clientId: string, room: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    // Remove client from room
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(clientId);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }
    client.rooms.delete(room);

    this.sendToClient(clientId, {
      type: 'room_left',
      data: { room },
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Send message to a specific client
   */
  public sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
      this.handleDisconnection(clientId);
      return false;
    }
  }

  /**
   * Broadcast message to multiple clients based on options
   */
  public broadcast(message: WebSocketMessage, options: BroadcastOptions = {}): number {
    let sentCount = 0;
    let targetClients: string[] = [];

    if (options.room) {
      // Broadcast to room
      const roomClients = this.rooms.get(options.room);
      if (roomClients) {
        targetClients = Array.from(roomClients);
      }
    } else if (options.userId) {
      // Broadcast to specific user
      const userRoom = `user:${options.userId}`;
      const roomClients = this.rooms.get(userRoom);
      if (roomClients) {
        targetClients = Array.from(roomClients);
      }
    } else if (options.orgId) {
      // Broadcast to organization
      const orgRoom = `org:${options.orgId}`;
      const roomClients = this.rooms.get(orgRoom);
      if (roomClients) {
        targetClients = Array.from(roomClients);
      }
    } else {
      // Broadcast to all clients
      targetClients = Array.from(this.clients.keys());
    }

    // Filter out excluded client
    if (options.exclude) {
      targetClients = targetClients.filter(id => id !== options.exclude);
    }

    // Send to all target clients
    targetClients.forEach(clientId => {
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  /**
   * Send job progress update
   */
  public sendJobProgress(jobId: string, progress: any, userId?: string): void {
    const message: WebSocketMessage = {
      type: 'job_progress',
      channel: `job:${jobId}`,
      data: {
        jobId,
        ...progress,
      },
      timestamp: new Date(),
    };

    // Send to job room and user room
    this.broadcast(message, { room: `job:${jobId}` });
    
    if (userId) {
      this.broadcast(message, { userId });
    }
  }

  /**
   * Send system notification
   */
  public sendSystemNotification(notification: any, options: BroadcastOptions = {}): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      data: notification,
      timestamp: new Date(),
    };

    this.broadcast(message, options);
  }

  /**
   * Send error notification
   */
  public sendError(error: any, options: BroadcastOptions = {}): void {
    const message: WebSocketMessage = {
      type: 'error',
      data: error,
      timestamp: new Date(),
    };

    this.broadcast(message, options);
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get room information
   */
  public getRoomInfo(room: string): { clientCount: number; clients: string[] } {
    const roomClients = this.rooms.get(room);
    if (!roomClients) {
      return { clientCount: 0, clients: [] };
    }

    return {
      clientCount: roomClients.size,
      clients: Array.from(roomClients),
    };
  }

  /**
   * Get client information
   */
  public getClientInfo(clientId: string): WebSocketClient | null {
    return this.clients.get(clientId) || null;
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 30000; // 30 seconds

      this.clients.forEach((client, clientId) => {
        const timeSinceHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > staleThreshold) {
          console.log(`Disconnecting stale client: ${clientId}`);
          client.ws.terminate();
          this.handleDisconnection(clientId);
        }
      });
    }, 15000); // Check every 15 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup and close all connections
   */
  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.clients.forEach(client => {
      client.ws.close(1001, 'Server shutting down');
    });

    this.clients.clear();
    this.rooms.clear();
    this.wss.close();
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(server?: any): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
  }
  return wsManager;
}