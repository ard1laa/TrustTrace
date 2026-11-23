import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';

Future<void> showServerConnectionDialog(BuildContext context, {VoidCallback? onSaved}) async {
  final ctrl = TextEditingController(text: ApiService.apiBaseUrl);
  await showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Server connection', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ValueListenableBuilder<bool>(
            valueListenable: ApiService.serverConnectedNotifier,
            builder: (_, connected, __) => Pill(
              connected ? 'Connected' : 'Not connected — using saved data',
              color: connected ? TrustTraceTheme.successGreen : TrustTraceTheme.warningAmber,
              icon: connected ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: ctrl,
            autocorrect: false,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'API URL',
              hintText: 'https://trusttrace.example.com/api',
              helperText: 'On a local network, use your computer\'s IP, e.g. http://<computer-ip>:3001/api',
              helperMaxLines: 2,
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(
          onPressed: () async {
            await ApiService.setServerUrl(ctrl.text);
            await ApiService.fetchAllData();
            onSaved?.call();
            if (ctx.mounted) Navigator.pop(ctx);
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
}

class AuthScreen extends StatefulWidget {
  final void Function(Map<String, dynamic> user, String? message) onAuthenticated;
  const AuthScreen({super.key, required this.onAuthenticated});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isRegister = false;
  String _role = 'student';
  String? _field;
  bool _obscure = true;
  String _loading = '';
  String? _error;
  Map<String, dynamic> _providers = const {};

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _university = TextEditingController();
  final _studentId = TextEditingController();
  final _company = TextEditingController();
  final _jobTitle = TextEditingController();
  final _department = TextEditingController();
  final _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadProviders();
  }

  Future<void> _loadProviders() async {
    final p = await ApiService.providers();
    if (mounted) setState(() => _providers = p);
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _university, _studentId, _company, _jobTitle, _department, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> get _profileFields => {
        'role': _role,
        'name': _name.text.trim(),
        'university': _university.text.trim(),
        'studentId': _studentId.text.trim(),
        'fieldOfStudy': _field ?? '',
        'companyName': _company.text.trim(),
        'jobTitle': _jobTitle.text.trim(),
        'departmentRole': _department.text.trim(),
        'verificationCode': _code.text.trim(),
      };

  Future<void> _run(String key, Future<ApiResult> Function() call) async {
    setState(() {
      _loading = key;
      _error = null;
    });
    final res = await call();
    if (!mounted) return;
    setState(() => _loading = '');
    if (res.ok && ApiService.currentUser != null) {
      widget.onAuthenticated(ApiService.currentUser!, res.data['message']?.toString());
    } else {
      if (res.data['needsOnboarding'] == true) setState(() => _isRegister = true);
      setState(() => _error = res.error);
    }
  }

  void _submit() {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    if (_isRegister) {
      if (_name.text.trim().isEmpty) return setState(() => _error = 'Enter your full name.');
      if (_password.text.length < 8) return setState(() => _error = 'Use at least 8 characters for your password.');
      if (_role == 'student' && _field == null) return setState(() => _error = 'Choose your field of study.');
      _run('form', () => ApiService.register({..._profileFields, 'email': _email.text.trim(), 'password': _password.text}));
    } else {
      _run('form', () => ApiService.login(_email.text, _password.text));
    }
  }

  Future<void> _google() async {
    final cfg = Map<String, dynamic>.from(_providers['google'] ?? {});
    try {
      final account = await GoogleSignIn(
        clientId: Platform.isIOS ? cfg['iosClientId']?.toString() : null,
        serverClientId: cfg['webClientId']?.toString(),
        scopes: const ['email', 'profile'],
      ).signIn();
      final idToken = (await account?.authentication)?.idToken;
      if (idToken == null) return;
      await _run('google', () => ApiService.oauthSignIn('google', idToken, {..._profileFields, 'name': account?.displayName ?? _name.text.trim()}));
    } catch (e) {
      setState(() => _error = 'Google sign-in failed. Check that this app is registered with your Google client ID.');
    }
  }

  Future<void> _apple() async {
    try {
      final cred = await SignInWithApple.getAppleIDCredential(scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName]);
      final token = cred.identityToken;
      if (token == null) return;
      final name = [cred.givenName, cred.familyName].whereType<String>().join(' ');
      await _run('apple', () => ApiService.oauthSignIn('apple', token, {..._profileFields, if (name.isNotEmpty) 'name': name}));
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code != AuthorizationErrorCode.canceled) setState(() => _error = 'Apple sign-in failed.');
    }
  }

  InputDecoration _dec(String label, {String? hint, Widget? suffix}) =>
      InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder(), isDense: true, suffixIcon: suffix);

  @override
  Widget build(BuildContext context) {
    final busy = _loading.isNotEmpty;
    final googleOn = _providers['google']?['enabled'] == true;
    final appleOn = _providers['apple']?['enabled'] == true && (Platform.isIOS || Platform.isMacOS);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 14,
        title: const Row(children: [
          BrandLogoBadge(size: 30, borderRadius: 8),
          SizedBox(width: 10),
          Flexible(child: Text('TrustTrace', overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
        ]),
        actions: [
          IconButton(
            tooltip: 'Server connection',
            onPressed: () => showServerConnectionDialog(context, onSaved: _loadProviders),
            icon: const Icon(Icons.dns_outlined, size: 20),
          ),
          const ThemeSwitcherBar(),
          const SizedBox(width: 6),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
              children: [
                Text(_isRegister ? 'Join TrustTrace' : 'Welcome back',
                    textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                const SizedBox(height: 4),
                Text(
                  _isRegister ? 'Verified credentials, mapped to the skills that matter.' : 'Sign in to your wallet or verifier.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13.5),
                ),
                const SizedBox(height: 18),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_isRegister) ...[
                          SegmentedButton<String>(
                            showSelectedIcon: false,
                            segments: const [
                              ButtonSegment(value: 'student', icon: Icon(Icons.school_outlined, size: 16), label: Text('Student', overflow: TextOverflow.ellipsis)),
                              ButtonSegment(value: 'recruiter', icon: Icon(Icons.work_outline, size: 16), label: Text('Recruiter', overflow: TextOverflow.ellipsis)),
                              ButtonSegment(value: 'admin', icon: Icon(Icons.account_balance_outlined, size: 16), label: Text('University', overflow: TextOverflow.ellipsis)),
                            ],
                            selected: {_role},
                            onSelectionChanged: (s) => setState(() {
                              _role = s.first;
                              _error = null;
                            }),
                          ),
                          const SizedBox(height: 14),
                        ],
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 200),
                          child: _error == null
                              ? const SizedBox.shrink()
                              : Container(
                                  key: ValueKey(_error),
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                                  child: Row(children: [
                                    const Icon(Icons.error_outline, color: Colors.red, size: 18),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: Colors.red, fontWeight: FontWeight.w600))),
                                  ]),
                                ),
                        ),
                        if (_isRegister) ...[
                          TextField(controller: _name, textCapitalization: TextCapitalization.words, autofillHints: const [AutofillHints.name], decoration: _dec('Full name', hint: 'Alex Johnson')),
                          const SizedBox(height: 10),
                        ],
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          autofillHints: const [AutofillHints.email],
                          decoration: _dec('Email', hint: _role == 'recruiter' ? 'recruiter@company.com' : _role == 'admin' ? 'registrar@university.edu' : 'student@university.edu'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _password,
                          obscureText: _obscure,
                          autofillHints: [_isRegister ? AutofillHints.newPassword : AutofillHints.password],
                          onSubmitted: (_) => _submit(),
                          decoration: _dec('Password',
                              hint: _isRegister ? 'At least 8 characters' : null,
                              suffix: IconButton(
                                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              )),
                        ),
                        if (_isRegister && _role == 'student') ...[
                          const SizedBox(height: 12),
                          FieldDropdown(value: _field, onChanged: (v) => setState(() => _field = v)),
                          const SizedBox(height: 10),
                          TextField(controller: _university, decoration: _dec('University', hint: 'Global Institute of Technology')),
                          const SizedBox(height: 10),
                          TextField(controller: _studentId, decoration: _dec('Student ID (optional)', hint: 'STU-2026-001')),
                        ],
                        if (_isRegister && _role == 'recruiter') ...[
                          const SizedBox(height: 10),
                          TextField(controller: _company, decoration: _dec('Company', hint: 'Global Tech Corp')),
                          const SizedBox(height: 10),
                          TextField(controller: _jobTitle, decoration: _dec('Job title', hint: 'Talent Acquisition')),
                        ],
                        if (_isRegister && _role == 'admin') ...[
                          const SizedBox(height: 10),
                          TextField(controller: _university, decoration: _dec('Institution', hint: 'Global Institute of Technology')),
                          const SizedBox(height: 10),
                          TextField(controller: _department, decoration: _dec('Department', hint: 'Office of the Registrar')),
                          const SizedBox(height: 10),
                          TextField(controller: _code, decoration: _dec('Verification code', hint: 'Issued by your institution')),
                        ],
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: busy ? null : _submit,
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                          child: _loading == 'form'
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : Text(_isRegister ? 'Create account' : 'Sign in', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                        ),
                        if (googleOn || appleOn) ...[
                          const SizedBox(height: 14),
                          Row(children: [
                            const Expanded(child: Divider()),
                            Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Text('or', style: TextStyle(color: Theme.of(context).hintColor))),
                            const Expanded(child: Divider()),
                          ]),
                          const SizedBox(height: 12),
                          if (googleOn)
                            OutlinedButton.icon(
                              onPressed: busy ? null : _google,
                              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46), shape: const StadiumBorder()),
                              icon: _loading == 'google'
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Text('G', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: Color(0xFF4285F4))),
                              label: const Text('Continue with Google', style: TextStyle(fontWeight: FontWeight.w700)),
                            ),
                          if (googleOn && appleOn) const SizedBox(height: 10),
                          if (appleOn)
                            SizedBox(
                              height: 46,
                              child: SignInWithAppleButton(
                                onPressed: busy ? () {} : _apple,
                                text: 'Continue with Apple',
                                borderRadius: const BorderRadius.all(Radius.circular(23)),
                                style: Theme.of(context).brightness == Brightness.dark ? SignInWithAppleButtonStyle.white : SignInWithAppleButtonStyle.black,
                              ),
                            ),
                        ],
                        const SizedBox(height: 14),
                        Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(_isRegister ? 'Already on TrustTrace?' : 'New to TrustTrace?', style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13)),
                            TextButton(
                              onPressed: () => setState(() {
                                _isRegister = !_isRegister;
                                _error = null;
                              }),
                              child: Text(_isRegister ? 'Sign in' : 'Create an account', style: const TextStyle(fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (_providers['demoLogin'] == true) ...[
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('DEMO ACCOUNTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Theme.of(context).hintColor)),
                          const SizedBox(height: 10),
                          _demoTile('recruiter', Icons.work_outline, 'Demo recruiter', 'Global Tech Corp'),
                          const SizedBox(height: 8),
                          _demoTile('admin', Icons.account_balance_outlined, 'Demo registrar', 'Global Institute of Technology'),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _demoTile(String role, IconData icon, String title, String subtitle) {
    return OutlinedButton(
      onPressed: _loading.isNotEmpty ? null : () => _run(role, () => ApiService.demoLogin(role)),
      style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      child: Row(children: [
        CircleAvatar(radius: 16, backgroundColor: TrustTraceTheme.linkedInBlue.withValues(alpha: 0.12), child: Icon(icon, size: 16, color: TrustTraceTheme.linkedInBlue)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor)),
          ]),
        ),
        if (_loading == role) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) else const Icon(Icons.chevron_right),
      ]),
    );
  }
}
