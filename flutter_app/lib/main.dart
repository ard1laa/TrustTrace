import 'dart:async';
import 'package:flutter/material.dart';
import 'screens/admin_portal_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/profile_settings_screen.dart';
import 'screens/qr_verifier_screen.dart';
import 'screens/student_wallet_screen.dart';
import 'services/api_service.dart';
import 'services/sync_service.dart';
import 'theme/trusttrace_theme.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiService.init();
  runApp(const TrustTraceApp());
}

class TrustTraceApp extends StatefulWidget {
  const TrustTraceApp({super.key});

  @override
  State<TrustTraceApp> createState() => _TrustTraceAppState();
}

class _TrustTraceAppState extends State<TrustTraceApp> with WidgetsBindingObserver {
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  Map<String, dynamic>? _user = ApiService.currentUser;
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _credentials = [];
  bool _offline = false;
  int _tab = 0;
  Timer? _poll;
  late final SyncService _sync = SyncService(onChange: _refresh);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ApiService.sessionExpiredNotifier.addListener(_onSessionExpired);
    _refresh();
    _sync.start();
    // Safety net for networks that block long-lived connections.
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ApiService.sessionExpiredNotifier.removeListener(_onSessionExpired);
    _poll?.cancel();
    _sync.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _sync.restart();
      _refresh();
    } else if (state == AppLifecycleState.paused) {
      _sync.stop();
    }
  }

  Future<void> _refresh() async {
    final data = await ApiService.fetchAllData();
    if (!mounted) return;
    setState(() {
      _offline = data['offline'] == true;
      _students = ApiService.listOf(data['students']);
      _credentials = ApiService.credentialsOf(data['credentials']);
      if (_user != null) _user = ApiService.currentUser ?? _user;
    });
  }

  void _onSessionExpired() {
    if (_user == null) return;
    _signOut(message: 'Your session expired. Please sign in again.');
  }

  Future<void> _signOut({String? message}) async {
    await ApiService.signOut();
    if (!mounted) return;
    setState(() {
      _user = null;
      _tab = 0;
      _credentials = [];
    });
    if (message != null) _messengerKey.currentState?.showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: TrustTraceTheme.themeModeNotifier,
      builder: (context, mode, _) => MaterialApp(
        title: 'TrustTrace',
        debugShowCheckedModeBanner: false,
        scaffoldMessengerKey: _messengerKey,
        theme: TrustTraceTheme.lightTheme,
        darkTheme: TrustTraceTheme.darkTheme,
        themeMode: mode,
        // Respect the user's text size but cap it so dense cards don't overflow on small iPhones.
        builder: (context, child) {
          final mq = MediaQuery.of(context);
          return MediaQuery(data: mq.copyWith(textScaler: mq.textScaler.clamp(maxScaleFactor: 1.3)), child: child!);
        },
        home: _user == null
            ? AuthScreen(
                onAuthenticated: (user, message) {
                  setState(() {
                    _user = user;
                    _tab = 0;
                  });
                  if (message != null) _messengerKey.currentState?.showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
                  _refresh();
                  _sync.restart();
                },
              )
            : _shell(),
      ),
    );
  }

  Widget _shell() {
    final user = _user!;
    final role = TrustTraceTheme.normalizeRole(user['role']);
    final home = switch (role) {
      'admin' => AdminPortalScreen(adminUser: user, students: _students, credentials: _credentials, onRefresh: _refresh),
      'recruiter' => QrVerifierScreen(recruiter: user, students: _students, credentials: _credentials, offline: _offline),
      _ => StudentWalletScreen(student: user, credentials: _credentials, offline: _offline, onRefresh: _refresh),
    };

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 14,
        title: Row(children: [
          const BrandLogoBadge(size: 30, borderRadius: 8),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              switch (role) { 'admin' => 'Registrar', 'recruiter' => 'Verifier', _ => 'Wallet' },
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
        ]),
        actions: [
          if (_offline)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: Tooltip(message: 'Offline — showing saved data', child: Icon(Icons.cloud_off_outlined, color: TrustTraceTheme.warningAmber, size: 20)),
            ),
          const ThemeSwitcherBar(),
          Padding(
            padding: const EdgeInsets.only(right: 10, left: 4),
            child: GestureDetector(onTap: () => setState(() => _tab = 1), child: UserAvatar(user: user, size: 32)),
          ),
        ],
      ),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(_tab),
            child: _tab == 1 ? ProfileSettingsScreen(user: user, onUserChanged: _refresh, onLogout: () => _signOut()) : home,
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          NavigationDestination(
            icon: Icon(switch (role) { 'admin' => Icons.account_balance_outlined, 'recruiter' => Icons.qr_code_scanner_rounded, _ => Icons.account_balance_wallet_outlined }),
            label: switch (role) { 'admin' => 'Registrar', 'recruiter' => 'Verify', _ => 'Wallet' },
          ),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
