// Field-of-study taxonomy. The data lives in skill_taxonomy_data.dart, generated
// from shared/skillTaxonomy.js (`npm run gen:taxonomy`); this file mirrors the
// JS resolution logic so web, server and mobile place credentials identically.
import 'package:flutter/material.dart';

part 'skill_taxonomy_data.dart';

class SkillAxis {
  final String name;
  final List<String> keywords;
  const SkillAxis(this.name, this.keywords);
}

/// Defines the six radar axes shared by a group of programmes.
class FieldFamily {
  final String id;
  final String label;
  final List<SkillAxis> axes;
  final List<int> benchmark;
  final Map<String, String> legacyMap;
  const FieldFamily(this.id, this.label, this.axes, this.benchmark, this.legacyMap);
}

/// A programme a student can pick ("Accounting", "Mechanical Engineering").
class Program {
  final String id;
  final String label;
  final String family;
  final List<String> aliases;
  const Program(this.id, this.label, this.family, this.aliases);
}

/// A resolved field: the programme's name with its family's axes.
class FieldOfStudy {
  final String id;
  final String label;
  final FieldFamily family;
  const FieldOfStudy(this.id, this.label, this.family);

  String get familyId => family.id;
  String get familyLabel => family.label;
  List<SkillAxis> get axes => family.axes;
  List<int> get benchmark => family.benchmark;
  Map<String, String> get legacyMap => family.legacyMap;
  List<String> get axisNames => axes.map((a) => a.name).toList();
}

class AxisScore {
  final String axis;
  final int score;
  final int count;
  final int benchmark;
  final Color color;
  const AxisScore(this.axis, this.score, this.count, this.benchmark, this.color);
}

class ProgramGroup {
  final FieldFamily family;
  final List<Program> programs;
  const ProgramGroup(this.family, this.programs);
}

class SkillTaxonomy {
  static const defaultFieldId = kDefaultFieldId;
  static const List<FieldFamily> families = kFieldFamilies;
  static const List<Program> programs = kPrograms;

  static const List<Color> axisColors = [
    Color(0xFF0A66C2),
    Color(0xFF0F766E),
    Color(0xFF7C3AED),
    Color(0xFFB45309),
    Color(0xFFBE185D),
    Color(0xFF15803D),
  ];

  static FieldFamily _family(String id) => families.firstWhere((f) => f.id == id, orElse: () => families.last);
  static FieldOfStudy _view(Program p) => FieldOfStudy(p.id, p.label, _family(p.family));
  static Program get _default => programs.firstWhere((p) => p.id == defaultFieldId);

  static List<ProgramGroup> get groups =>
      [for (final f in families) ProgramGroup(f, programs.where((p) => p.family == f.id).toList())];

  static bool isKnownId(String? id) => id != null && (programs.any((p) => p.id == id) || families.any((f) => f.id == id));

  static FieldOfStudy byId(String id) => resolve(id);

  /// Accepts a programme id, a family id, a label, or free text ("BSc Accounting").
  static FieldOfStudy resolve(dynamic fieldOrProgram) {
    final q = (fieldOrProgram ?? '').toString().trim().toLowerCase();
    if (q.isEmpty) return _view(_default);
    for (final p in programs) {
      if (p.id == q || p.label.toLowerCase() == q) return _view(p);
    }
    for (final f in families) {
      if (f.id == q || f.label.toLowerCase() == q) return FieldOfStudy(f.id, f.label, f);
    }
    Program? best;
    var bestLen = 0;
    for (final p in programs) {
      if (p.id == defaultFieldId) continue;
      for (final phrase in [p.label.replaceAll(RegExp(r'\s*\(.*\)$'), ''), ...p.aliases]) {
        final needle = phrase.toLowerCase().trim();
        if (needle.length < 2 || needle.length <= bestLen) continue;
        if (RegExp('(^|[^a-z])${RegExp.escape(needle)}([^a-z]|\$)').hasMatch(q)) {
          best = p;
          bestLen = needle.length;
        }
      }
    }
    return _view(best ?? _default);
  }

  static FieldOfStudy forUser(Map<String, dynamic>? user) {
    final f = (user?['fieldOfStudy'] ?? '').toString();
    return resolve(f.isNotEmpty ? f : user?['program']);
  }

  static String? inferAxis(FieldOfStudy field, String text) {
    final haystack = ' ${text.toLowerCase()} ';
    String? best;
    var bestScore = 0;
    for (final axis in field.axes) {
      var score = 0;
      for (final kw in axis.keywords) {
        if (haystack.contains(kw)) score += kw.contains(' ') ? 2 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = axis.name;
      }
    }
    return best;
  }

  static String axisFor(Map<String, dynamic> cred, FieldOfStudy field) {
    final domain = (cred['competencyDomain'] ?? '').toString();
    if (field.axisNames.contains(domain)) return domain;
    final text = '${cred['achievementTitle'] ?? ''} ${cred['description'] ?? ''} ${cred['issuingOrganization'] ?? ''}';
    return inferAxis(field, text) ?? field.legacyMap[domain] ?? field.axisNames.last;
  }

  static Color colorFor(FieldOfStudy field, String axis) {
    final i = field.axisNames.indexOf(axis);
    return axisColors[i < 0 ? 0 : i];
  }

  static List<AxisScore> scores(List<Map<String, dynamic>> creds, FieldOfStudy field, {bool respectPrivacy = true}) {
    final buckets = {for (final a in field.axisNames) a: <num>[]};
    for (final c in creds) {
      if (respectPrivacy && c['isPublic'] == false) continue;
      if (c['state'] == 'Draft' || c['state'] == 'Revoked') continue;
      buckets[axisFor(c, field)]?.add(num.tryParse('${c['masteryScore']}') ?? 0);
    }
    return [
      for (var i = 0; i < field.axes.length; i++)
        AxisScore(
          field.axes[i].name,
          buckets[field.axes[i].name]!.isEmpty
              ? 0
              : (buckets[field.axes[i].name]!.reduce((a, b) => a + b) / buckets[field.axes[i].name]!.length).round(),
          buckets[field.axes[i].name]!.length,
          field.benchmark[i],
          axisColors[i],
        ),
    ];
  }
}
