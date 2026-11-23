import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

/// Listens to the server's change stream (GET /api/events) and calls [onChange]
/// whenever data changes on any client, so web edits show up on mobile at once.
/// Reconnects with backoff; a slow poll in main.dart covers networks that block SSE.
class SyncService {
  final void Function() onChange;
  http.Client? _client;
  StreamSubscription<String>? _sub;
  Timer? _retry;
  Timer? _debounce;
  int _attempt = 0;
  bool _stopped = true;

  SyncService({required this.onChange});

  void start() {
    if (!_stopped) return;
    _stopped = false;
    _connect();
  }

  void stop() {
    _stopped = true;
    _retry?.cancel();
    _debounce?.cancel();
    _sub?.cancel();
    _client?.close();
  }

  void restart() {
    stop();
    start();
  }

  Future<void> _connect() async {
    if (_stopped) return;
    _client = http.Client();
    try {
      final req = http.Request('GET', Uri.parse('${ApiService.apiBaseUrl}/events'))..headers['Accept'] = 'text/event-stream';
      final res = await _client!.send(req);
      if (res.statusCode != 200) throw Exception('status ${res.statusCode}');
      _attempt = 0;
      ApiService.serverConnectedNotifier.value = true;
      String? event;
      _sub = res.stream.transform(utf8.decoder).transform(const LineSplitter()).listen(
        (line) {
          if (line.startsWith('event:')) {
            event = line.substring(6).trim();
          } else if (line.startsWith('data:') && (event == 'change' || event == 'hello')) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 250), onChange);
          } else if (line.isEmpty) {
            event = null;
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _client?.close();
    if (_stopped) return;
    _attempt++;
    final delay = Duration(seconds: (2 << (_attempt.clamp(1, 5) - 1)).clamp(2, 30));
    _retry = Timer(delay, _connect);
  }
}
