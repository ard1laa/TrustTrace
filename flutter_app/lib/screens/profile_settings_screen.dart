import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../core/skill_taxonomy.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';
import 'auth_screen.dart';

class ProfileSettingsScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  final VoidCallback onUserChanged;
  final VoidCallback onLogout;
  const ProfileSettingsScreen({super.key, required this.user, required this.onUserChanged, required this.onLogout});

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  late final _name = TextEditingController(text: '${widget.user['name'] ?? ''}');
  late final _headline = TextEditingController(text: '${widget.user['headline'] ?? ''}');
  late final _bio = TextEditingController(text: '${widget.user['bio'] ?? ''}');
  late final _location = TextEditingController(text: '${widget.user['location'] ?? ''}');
  late final _university = TextEditingController(text: '${widget.user['university'] ?? ''}');
  late final _email = TextEditingController(text: '${widget.user['email'] ?? ''}');
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  late String? _field = SkillTaxonomy.forUser(widget.user).id;
  String _busy = '';

  bool get _isStudent => widget.user['role'] == 'student';
  bool get _hasPassword => widget.user['hasPassword'] != false;

  @override
  void dispose() {
    for (final c in [_name, _headline, _bio, _location, _university, _email, _currentPw, _newPw]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _call(String key, Future<ApiResult> Function() fn, String success) async {
    setState(() => _busy = key);
    final res = await fn();
    if (!mounted) return;
    setState(() => _busy = '');
    showToast(context, res.ok ? (res.data['message']?.toString() ?? success) : res.error!, error: !res.ok);
    if (res.ok) widget.onUserChanged();
  }

  Future<void> _pickAvatar() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 320, maxHeight: 320, imageQuality: 80);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final mime = file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    await _call('avatar', () => ApiService.updateProfile({'avatarUrl': 'data:$mime;base64,${base64Encode(bytes)}'}), 'Profile photo updated.');
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text('This permanently removes your profile and every credential in your wallet. It cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: TrustTraceTheme.dangerRed),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final res = await ApiService.deleteAccount();
    if (!mounted) return;
    if (res.ok) {
      widget.onLogout();
    } else {
      showToast(context, res.error!, error: true);
    }
  }

  InputDecoration _dec(String label, {String? hint}) =>
      InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder(), isDense: true);

  @override
  Widget build(BuildContext context) {
    final user = widget.user;
    final emailChanged = _email.text.trim().toLowerCase() != '${user['email']}'.toLowerCase();
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 32),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(children: [
              Stack(children: [
                UserAvatar(user: user, size: 96, ring: true),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Material(
                    color: TrustTraceTheme.linkedInBlue,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _busy.isEmpty ? _pickAvatar : null,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: _busy == 'avatar'
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.photo_camera_outlined, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Text('${user['name']}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              Text('${user['email']}', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor, fontSize: 12.5)),
              if ('${user['avatarUrl'] ?? ''}'.isNotEmpty)
                TextButton(
                  onPressed: () => _call('avatar', () => ApiService.updateProfile({'avatarUrl': ''}), 'Photo removed.'),
                  child: const Text('Remove photo', style: TextStyle(color: TrustTraceTheme.dangerRed)),
                ),
            ]),
          ),
        ),
        SectionCard(
          title: 'Profile',
          icon: Icons.person_outline,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: _dec('Full name')),
            const SizedBox(height: 10),
            TextField(controller: _headline, maxLength: 120, decoration: _dec('Headline')),
            const SizedBox(height: 4),
            TextField(controller: _bio, maxLines: 3, maxLength: 600, decoration: _dec('About', hint: 'A short summary recruiters will see')),
            const SizedBox(height: 4),
            TextField(controller: _location, decoration: _dec('Location', hint: 'City, Country')),
            if (_isStudent) ...[
              const SizedBox(height: 12),
              FieldDropdown(value: _field, onChanged: (v) => setState(() => _field = v)),
              const SizedBox(height: 10),
              TextField(controller: _university, decoration: _dec('University')),
            ],
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _busy.isNotEmpty
                  ? null
                  : () => _call(
                        'profile',
                        () => ApiService.updateProfile({
                          'name': _name.text.trim(),
                          'headline': _headline.text.trim(),
                          'bio': _bio.text.trim(),
                          'location': _location.text.trim(),
                          if (_isStudent) 'fieldOfStudy': _field,
                          if (_isStudent) 'university': _university.text.trim(),
                        }),
                        'Profile saved.',
                      ),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), shape: const StadiumBorder()),
              child: _busy == 'profile'
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save profile', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
        SectionCard(
          title: 'Sign-in & security',
          icon: Icons.shield_outlined,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, onChanged: (_) => setState(() {}), decoration: _dec('Email')),
            if (_hasPassword) ...[
              const SizedBox(height: 10),
              TextField(controller: _currentPw, obscureText: true, decoration: _dec('Current password', hint: emailChanged ? 'Required to change your email' : null)),
            ],
            const SizedBox(height: 10),
            TextField(controller: _newPw, obscureText: true, decoration: _dec(_hasPassword ? 'New password' : 'Set a password', hint: 'At least 8 characters')),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton(
                onPressed: !emailChanged || _busy.isNotEmpty
                    ? null
                    : () => _call('email', () => ApiService.updateProfile({'email': _email.text.trim(), 'currentPassword': _currentPw.text}), 'Email updated.'),
                child: const Text('Update email'),
              ),
              OutlinedButton(
                onPressed: _busy.isNotEmpty
                    ? null
                    : () async {
                        await _call('password', () => ApiService.changePassword(_currentPw.text, _newPw.text), 'Password updated.');
                        _currentPw.clear();
                        _newPw.clear();
                      },
                child: Text(_hasPassword ? 'Change password' : 'Set password'),
              ),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              if (_hasPassword) const Pill('Email & password', color: Colors.grey),
              for (final p in (user['linkedProviders'] as List? ?? const [])) Pill('$p'.toUpperCase(), color: TrustTraceTheme.linkedInBlue),
            ]),
          ]),
        ),
        SectionCard(
          title: 'Wallet',
          icon: Icons.key_outlined,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            CopyableCryptoRow(label: 'DID', value: '${user['did'] ?? ''}'),
            CopyableCryptoRow(label: 'Wallet', value: '${user['walletAddress'] ?? ''}'),
            if ('${user['seedPhrase'] ?? ''}'.isNotEmpty) CopyableCryptoRow(label: 'Recovery', value: '${user['seedPhrase']}'),
          ]),
        ),
        SectionCard(
          title: 'Appearance',
          icon: Icons.palette_outlined,
          child: ValueListenableBuilder<ThemeMode>(
            valueListenable: TrustTraceTheme.themeModeNotifier,
            builder: (_, mode, __) => SegmentedButton<ThemeMode>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined, size: 16), label: Text('Light')),
                ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined, size: 16), label: Text('Dark')),
                ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined, size: 16), label: Text('System')),
              ],
              selected: {mode},
              onSelectionChanged: (s) => TrustTraceTheme.themeModeNotifier.value = s.first,
            ),
          ),
        ),
        SectionCard(
          title: 'Account',
          icon: Icons.settings_outlined,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.dns_outlined),
              title: const Text('Server connection'),
              subtitle: Text(ApiService.apiBaseUrl, maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => showServerConnectionDialog(context, onSaved: () => setState(() {})),
            ),
            const SizedBox(height: 6),
            OutlinedButton.icon(onPressed: widget.onLogout, icon: const Icon(Icons.logout, size: 18), label: const Text('Sign out')),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _confirmDelete,
              style: TextButton.styleFrom(foregroundColor: TrustTraceTheme.dangerRed),
              icon: const Icon(Icons.delete_forever_outlined, size: 18),
              label: const Text('Delete account'),
            ),
          ]),
        ),
      ],
    );
  }
}
