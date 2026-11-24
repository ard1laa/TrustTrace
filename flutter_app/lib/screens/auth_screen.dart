import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../core/email_domains.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';
import 'document_camera_screen.dart';

const kAppVersion = '2.2.0';

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

const _steps = {
  'student': ['Account type', 'Your details', 'Your studies'],
  'recruiter': ['Account type', 'Your details', 'Company', 'Verification'],
  'admin': ['Account type', 'Your details', 'Institution', 'Verification'],
};

class _Proof {
  final String dataUrl;
  final String fileName;
  final Uint8List? preview;
  const _Proof(this.dataUrl, this.fileName, this.preview);
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isRegister = false;
  int _step = 0;
  String _role = 'student';
  String? _field;
  bool _obscure = true;
  String _loading = '';
  String? _error;
  Map<String, dynamic> _providers = const {};
  _Proof? _proof;
  bool _devOpen = ApiService.developerTokenNotifier.value != null;
  int _taps = 0;
  DateTime _lastTap = DateTime(2000);

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _university = TextEditingController();
  final _studentId = TextEditingController();
  final _company = TextEditingController();
  final _jobTitle = TextEditingController();
  final _companyRegId = TextEditingController();
  final _department = TextEditingController();

  List<String> get _stepNames => _steps[_role]!;
  bool get _lastStep => _step == _stepNames.length - 1;
  EmailInfo get _emailInfo => classifyEmail(_email.text, _role);
  bool get _needsProof => _role != 'student' && !_emailInfo.institutional;

  @override
  void initState() {
    super.initState();
    _loadProviders();
    _email.addListener(() => setState(() {}));
  }

  Future<void> _loadProviders() async {
    final p = await ApiService.providers();
    if (mounted) setState(() => _providers = p);
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _university, _studentId, _company, _jobTitle, _companyRegId, _department]) {
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
        'companyRegId': _companyRegId.text.trim(),
        'departmentRole': _department.text.trim(),
        if (_proof != null) 'verificationProof': {'dataUrl': _proof!.dataUrl, 'fileName': _proof!.fileName},
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

  String? _stepError() {
    switch (_stepNames[_step]) {
      case 'Your details':
        if (_name.text.trim().isEmpty) return 'Enter your full name.';
        if (_emailInfo.kind == EmailKind.invalid) return 'Enter a valid email address.';
        if (_emailInfo.kind == EmailKind.disposable) return 'Disposable email addresses are not accepted.';
        if (_password.text.length < 8) return 'Use at least 8 characters for your password.';
      case 'Your studies':
        if (_field == null) return 'Choose your programme.';
        if (_university.text.trim().isEmpty) return 'Enter your university.';
      case 'Company':
        if (_company.text.trim().isEmpty) return 'Enter your company name.';
      case 'Institution':
        if (_university.text.trim().isEmpty) return 'Enter your institution.';
      case 'Verification':
        if (_needsProof && _proof == null) return 'Attach your ${_role == 'admin' ? 'staff' : 'corporate'} ID to continue.';
    }
    return null;
  }

  void _submit() {
    FocusScope.of(context).unfocus();
    if (!_isRegister) {
      if (_email.text.trim().isEmpty || _password.text.isEmpty) return setState(() => _error = 'Enter your email and password.');
      _run('form', () => ApiService.login(_email.text, _password.text));
      return;
    }
    final problem = _stepError();
    if (problem != null) return setState(() => _error = problem);
    if (!_lastStep) {
      return setState(() {
        _error = null;
        _step++;
      });
    }
    _run('form', () => ApiService.register({..._profileFields, 'email': _email.text.trim(), 'password': _password.text}));
  }

  void _toggleMode() => setState(() {
        _isRegister = !_isRegister;
        _step = 0;
        _error = null;
      });

  // Hidden developer gesture: 7 quick taps (or long-presses) on the version label.
  void _versionTap() {
    final now = DateTime.now();
    _taps = now.difference(_lastTap) < const Duration(milliseconds: 1500) ? _taps + 1 : 1;
    _lastTap = now;
    if (_taps >= 7) {
      _taps = 0;
      HapticFeedback.heavyImpact();
      setState(() => _devOpen = true);
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

  Future<void> _attachProof(String source) async {
    if (source == 'camera') {
      final doc = await captureDocument(context, title: 'Scan your ID');
      if (doc != null) setState(() => _proof = _Proof('data:image/jpeg;base64,${base64Encode(doc.jpeg)}', 'id_scan.jpg', doc.jpeg));
      return;
    }
    final picked = source == 'gallery' ? await ApiService.pickFromGallery() : await ApiService.pickFromFiles();
    if (picked == null) return;
    final dataUrl = '${picked['base64Data'] ?? ''}';
    if (dataUrl.length > 5.5 * 1024 * 1024) return setState(() => _error = 'That file is larger than 4 MB.');
    Uint8List? preview;
    try {
      final b64 = '${picked['previewBase64'] ?? ''}';
      if (b64.isNotEmpty) preview = base64Decode(b64);
    } catch (_) {}
    setState(() {
      _proof = _Proof(dataUrl, '${picked['fileName'] ?? 'id_document'}', preview);
      _error = null;
    });
  }

  InputDecoration _dec(String label, {String? hint, String? helper, Widget? suffix}) => InputDecoration(
        labelText: label,
        hintText: hint,
        helperText: helper,
        helperMaxLines: 2,
        border: const OutlineInputBorder(),
        isDense: true,
        suffixIcon: suffix,
      );

  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
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
              padding: const EdgeInsets.fromLTRB(16, 22, 16, 24),
              children: [
                Text(_isRegister ? 'Create your account' : 'Welcome back',
                    textAlign: TextAlign.center, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                const SizedBox(height: 6),
                Text(
                  _isRegister ? 'Verified credentials, mapped to the skills that matter.' : 'Sign in to your wallet or verifier.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: hint, fontSize: 14),
                ),
                const SizedBox(height: 20),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(18, 20, 18, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (_isRegister) ...[_stepper(context), const SizedBox(height: 18)],
                      AnimatedSize(
                        duration: const Duration(milliseconds: 200),
                        child: _error == null ? const SizedBox(width: double.infinity) : _errorBox(),
                      ),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: KeyedSubtree(
                          key: ValueKey(_isRegister ? '$_role-$_step' : 'login'),
                          child: _isRegister ? _registerStep(context) : _loginFields(),
                        ),
                      ),
                      const SizedBox(height: 18),
                      _actions(),
                      if (!_isRegister || _lastStep) _socialButtons(context),
                      const SizedBox(height: 8),
                      Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(_isRegister ? 'Already on TrustTrace?' : 'New to TrustTrace?', style: TextStyle(color: hint, fontSize: 13)),
                          TextButton(onPressed: _toggleMode, child: Text(_isRegister ? 'Sign in' : 'Create an account', style: const TextStyle(fontWeight: FontWeight.w800))),
                        ],
                      ),
                    ]),
                  ),
                ),
                if (_devOpen) ...[
                  const SizedBox(height: 12),
                  _DeveloperCard(
                    keyRequired: _providers['demoLogin'] != true,
                    busyId: _loading,
                    onClose: () => setState(() => _devOpen = false),
                    onPick: (a) {
                      _email.text = '${a['email']}';
                      _password.clear();
                      _run('${a['id']}', () => ApiService.demoLoginAs('${a['id']}'));
                    },
                  ),
                ],
                const SizedBox(height: 14),
                Center(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _versionTap,
                    onLongPress: _versionTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                      child: Text('TrustTrace v$kAppVersion', style: TextStyle(fontSize: 11.5, color: hint.withValues(alpha: 0.7))),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _errorBox() => Container(
        key: ValueKey(_error),
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(color: TrustTraceTheme.dangerRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.error_outline, color: TrustTraceTheme.dangerRed, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: TrustTraceTheme.dangerRed, fontWeight: FontWeight.w600))),
        ]),
      );

  Widget _stepper(BuildContext context) {
    final names = _stepNames;
    return Row(children: [
      for (var i = 0; i < names.length; i++) ...[
        if (i > 0) const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              height: 4,
              decoration: BoxDecoration(color: i <= _step ? TrustTraceTheme.linkedInBlue : Theme.of(context).dividerColor, borderRadius: BorderRadius.circular(4)),
            ),
            const SizedBox(height: 5),
            Text(names[i],
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: i == _step ? TrustTraceTheme.linkedInBlue : Theme.of(context).hintColor)),
          ]),
        ),
      ],
    ]);
  }

  Widget _passwordField() => TextField(
        controller: _password,
        obscureText: _obscure,
        autofillHints: [_isRegister ? AutofillHints.newPassword : AutofillHints.password],
        onSubmitted: (_) => _submit(),
        decoration: _dec('Password',
            helper: _isRegister ? 'At least 8 characters.' : null,
            suffix: IconButton(
              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19),
              onPressed: () => setState(() => _obscure = !_obscure),
            )),
      );

  Widget _loginFields() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          autofillHints: const [AutofillHints.email],
          decoration: _dec('Email'),
        ),
        const SizedBox(height: 12),
        _passwordField(),
      ]);

  Widget _registerStep(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    switch (_stepNames[_step]) {
      case 'Account type':
        return Column(children: [
          for (final (id, icon, label, blurb) in [
            ('student', Icons.school_outlined, 'Student', 'Collect verified certificates and share your skill profile.'),
            ('recruiter', Icons.work_outline, 'Recruiter', 'Verify candidates instantly. Requires company verification.'),
            ('admin', Icons.account_balance_outlined, 'University staff', 'Issue and approve credentials. Requires staff verification.'),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RoleCard(
                icon: icon,
                label: label,
                blurb: blurb,
                selected: _role == id,
                onTap: () => setState(() {
                  _role = id;
                  _error = null;
                }),
              ),
            ),
        ]);
      case 'Your details':
        final info = _emailInfo;
        final emailHelper = _role != 'student' && _email.text.contains('@') && info.kind != EmailKind.invalid
            ? info.institutional
                ? '✓ ${info.domain} looks like a ${_role == 'admin' ? 'university' : 'company'} domain.'
                : '${info.domain} is a ${info.kind == EmailKind.disposable ? 'disposable' : 'personal'} address — you’ll upload an ID next.'
            : null;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: _name, textCapitalization: TextCapitalization.words, autofillHints: const [AutofillHints.name], decoration: _dec('Full name', hint: 'As shown on your certificates')),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            autofillHints: const [AutofillHints.email],
            decoration: _dec(_role == 'recruiter' ? 'Work email' : _role == 'admin' ? 'University email' : 'Email', helper: emailHelper),
          ),
          const SizedBox(height: 12),
          _passwordField(),
        ]);
      case 'Your studies':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          FieldDropdown(value: _field, onChanged: (v) => setState(() => _field = v)),
          const SizedBox(height: 12),
          TextField(controller: _university, textCapitalization: TextCapitalization.words, decoration: _dec('University', hint: 'e.g. Universiti Teknologi Malaysia')),
          const SizedBox(height: 12),
          TextField(controller: _studentId, decoration: _dec('Student ID (optional)', helper: 'Shown to recruiters who verify you.')),
        ]);
      case 'Company':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: _company, textCapitalization: TextCapitalization.words, decoration: _dec('Company')),
          const SizedBox(height: 12),
          TextField(controller: _jobTitle, textCapitalization: TextCapitalization.words, decoration: _dec('Job title', hint: 'Talent Acquisition')),
          const SizedBox(height: 12),
          TextField(controller: _companyRegId, decoration: _dec('Company registration no. (optional)', helper: 'Helps the registrar verify you faster.')),
        ]);
      case 'Institution':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: _university, textCapitalization: TextCapitalization.words, decoration: _dec('Institution', hint: 'e.g. Universiti Malaya')),
          const SizedBox(height: 12),
          TextField(controller: _department, textCapitalization: TextCapitalization.words, decoration: _dec('Department or role', hint: 'Office of the Registrar')),
        ]);
      default:
        final info = _emailInfo;
        final ok = info.institutional;
        final color = ok ? TrustTraceTheme.successGreen : TrustTraceTheme.warningAmber;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(ok ? Icons.verified_outlined : Icons.info_outline, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  ok
                      ? 'Your ${_role == 'admin' ? 'university' : 'company'} email (${info.domain}) counts as proof. An ID is optional but speeds up approval.'
                      : '${info.domain} is a personal address, so we need your ${_role == 'admin' ? 'staff' : 'corporate'} ID.',
                  style: const TextStyle(fontSize: 12.5, height: 1.35),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          if (_proof != null)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(border: Border.all(color: Theme.of(context).dividerColor), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: _proof!.preview != null
                      ? Image.memory(_proof!.preview!, width: 56, height: 40, fit: BoxFit.cover)
                      : Container(width: 56, height: 40, color: TrustTraceTheme.linkedInBlue.withValues(alpha: 0.1), child: const Icon(Icons.description_outlined, color: TrustTraceTheme.linkedInBlue)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(_proof!.fileName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                IconButton(onPressed: () => setState(() => _proof = null), icon: const Icon(Icons.close_rounded, size: 19), tooltip: 'Remove'),
              ]),
            )
          else
            Row(children: [
              for (final (src, icon, label) in [('camera', Icons.document_scanner_outlined, 'Scan ID'), ('gallery', Icons.photo_library_outlined, 'Photos'), ('files', Icons.picture_as_pdf_outlined, 'Files')]) ...[
                if (src != 'camera') const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _attachProof(src),
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    child: Column(children: [Icon(icon, size: 21), const SizedBox(height: 4), Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]),
                  ),
                ),
              ],
            ]),
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.shield_outlined, size: 15, color: TrustTraceTheme.linkedInBlue),
            const SizedBox(width: 6),
            Expanded(
              child: Text('Your account stays pending until a registrar approves it. The document is only seen by reviewers and deleted after approval.',
                  style: TextStyle(fontSize: 11.5, color: hint, height: 1.35)),
            ),
          ]),
        ]);
    }
  }

  Widget _actions() {
    final busy = _loading.isNotEmpty;
    final label = !_isRegister
        ? 'Sign in'
        : _lastStep
            ? (_role == 'student' ? 'Create account' : 'Submit for verification')
            : 'Continue';
    return Row(children: [
      if (_isRegister && _step > 0) ...[
        SizedBox(
          width: 50,
          height: 50,
          child: OutlinedButton(
            onPressed: busy ? null : () => setState(() {
              _error = null;
              _step--;
            }),
            style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, shape: const CircleBorder()),
            child: const Icon(Icons.arrow_back_rounded, size: 20),
          ),
        ),
        const SizedBox(width: 10),
      ],
      Expanded(
        child: FilledButton(
          onPressed: busy ? null : _submit,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: const StadiumBorder()),
          child: _loading == 'form'
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        ),
      ),
    ]);
  }

  Widget _socialButtons(BuildContext context) {
    final busy = _loading.isNotEmpty;
    final googleOn = _providers['google']?['enabled'] == true;
    final appleOn = _providers['apple']?['enabled'] == true && (Platform.isIOS || Platform.isMacOS);
    if (!googleOn && !appleOn) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
    ]);
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String blurb;
  final bool selected;
  final VoidCallback onTap;
  const _RoleCard({required this.icon, required this.label, required this.blurb, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    const blue = TrustTraceTheme.linkedInBlue;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? blue.withValues(alpha: 0.07) : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: selected ? blue : Theme.of(context).dividerColor, width: selected ? 1.5 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: selected ? blue : Theme.of(context).dividerColor.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: selected ? Colors.white : Theme.of(context).hintColor, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                  const SizedBox(height: 2),
                  Text(blurb, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor, height: 1.3)),
                ]),
              ),
              if (selected) const Icon(Icons.check_circle_rounded, color: blue, size: 20),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Presenter tools, revealed by the hidden gesture. Needs the server's
/// developer key unless the server already allows demo logins.
class _DeveloperCard extends StatefulWidget {
  final bool keyRequired;
  final String busyId;
  final VoidCallback onClose;
  final void Function(Map<String, dynamic> account) onPick;
  const _DeveloperCard({required this.keyRequired, required this.busyId, required this.onClose, required this.onPick});

  @override
  State<_DeveloperCard> createState() => _DeveloperCardState();
}

class _DeveloperCardState extends State<_DeveloperCard> {
  final _key = TextEditingController();
  List<Map<String, dynamic>> _accounts = [];
  bool _loading = false;
  String? _error;

  bool get _unlocked => ApiService.developerTokenNotifier.value != null;

  @override
  void initState() {
    super.initState();
    if (_unlocked) {
      _loadAccounts();
    } else if (!widget.keyRequired) {
      _unlock();
    }
  }

  @override
  void dispose() {
    _key.dispose();
    super.dispose();
  }

  Future<void> _loadAccounts() async {
    final list = await ApiService.demoAccounts();
    if (mounted) setState(() => _accounts = list);
  }

  Future<void> _unlock() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await ApiService.developerUnlock(_key.text);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok) {
        _accounts = ApiService.credentialsOf(res.data['demoAccounts']);
        _key.clear();
      } else {
        _error = res.error;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 6, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.code_rounded, size: 16, color: TrustTraceTheme.linkedInBlue),
            const SizedBox(width: 6),
            Text('DEVELOPER MODE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: hint)),
            const Spacer(),
            if (_unlocked)
              TextButton(
                onPressed: () async {
                  await ApiService.setDeveloperToken(null);
                  widget.onClose();
                },
                child: const Text('Exit', style: TextStyle(fontSize: 12.5)),
              ),
            IconButton(onPressed: widget.onClose, icon: const Icon(Icons.close_rounded, size: 19), tooltip: 'Hide'),
          ]),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: !_unlocked
                ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Enter the developer key to use the presentation accounts.', style: TextStyle(fontSize: 12.5, color: hint)),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(
                        child: TextField(
                          controller: _key,
                          obscureText: true,
                          autocorrect: false,
                          onSubmitted: (_) => _unlock(),
                          decoration: InputDecoration(hintText: 'Developer key', errorText: _error, border: const OutlineInputBorder(), isDense: true, prefixIcon: const Icon(Icons.key_rounded, size: 18)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _loading ? null : _unlock,
                        style: FilledButton.styleFrom(shape: const StadiumBorder(), minimumSize: const Size(0, 44)),
                        child: _loading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Unlock'),
                      ),
                    ]),
                  ])
                : Column(children: [
                    if (_accounts.isEmpty) Text('Loading demo accounts…', style: TextStyle(fontSize: 12.5, color: hint)),
                    for (final a in _accounts)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: OutlinedButton(
                          onPressed: widget.busyId.isNotEmpty ? null : () => widget.onPick(a),
                          style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                          child: Row(children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: TrustTraceTheme.linkedInBlue.withValues(alpha: 0.12),
                              child: Icon(a['role'] == 'admin' ? Icons.account_balance_outlined : Icons.work_outline, size: 16, color: TrustTraceTheme.linkedInBlue),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${a['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                Text('${a['email']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: hint)),
                              ]),
                            ),
                            if (widget.busyId == a['id'])
                              const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            else
                              const Icon(Icons.chevron_right),
                          ]),
                        ),
                      ),
                  ]),
          ),
        ]),
      ),
    );
  }
}
