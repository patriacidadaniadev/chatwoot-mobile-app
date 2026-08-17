class RTCPeerConnection {
  // Os testes precisam alcançar a instância que o módulo criou internamente.
  static instances = [];

  constructor() {
    this.iceGatheringState = 'complete';
    this.localDescription = { sdp: 'mock-offer-sdp' };
    this.onicegatheringstatechange = null;
    RTCPeerConnection.instances.push(this);
  }
  addTrack = jest.fn();
  createOffer = jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer-sdp' });
  setLocalDescription = jest.fn().mockResolvedValue(undefined);
  setRemoteDescription = jest.fn().mockResolvedValue(undefined);
  close = jest.fn();
}

class RTCSessionDescription {
  constructor(init) {
    Object.assign(this, init);
  }
}

class MediaStream {
  getTracks = jest.fn().mockReturnValue([]);
  getAudioTracks = jest.fn().mockReturnValue([]);
}

module.exports = {
  RTCPeerConnection,
  RTCSessionDescription,
  MediaStream,
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue(new MediaStream()),
  },
};
