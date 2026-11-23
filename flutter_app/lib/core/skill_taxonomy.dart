// Dart copy of shared/skillTaxonomy.js. Keep both in sync: the server, web and
// mobile apps must place each credential on the same radar axis.
import 'package:flutter/material.dart';

class SkillAxis {
  final String name;
  final List<String> keywords;
  const SkillAxis(this.name, this.keywords);
}

class FieldOfStudy {
  final String id;
  final String label;
  final List<SkillAxis> axes;
  final List<int> benchmark;
  final Map<String, String> legacyMap;
  const FieldOfStudy(this.id, this.label, this.axes, this.benchmark, this.legacyMap);

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

class SkillTaxonomy {
  static const defaultFieldId = 'others';

  static const List<Color> axisColors = [
    Color(0xFF0A66C2),
    Color(0xFF0F766E),
    Color(0xFF7C3AED),
    Color(0xFFB45309),
    Color(0xFFBE185D),
    Color(0xFF15803D),
  ];

  static const List<FieldOfStudy> fields = [
    FieldOfStudy('computer-science', 'Computer Science', [
      SkillAxis('Computational Thinking', ['computational', 'problem solving', 'hackathon', 'olympiad', 'puzzle', 'challenge', 'ctf']),
      SkillAxis('Programming', ['programming', 'coding', 'code', 'python', 'java', 'javascript', 'react', 'flutter', 'developer', 'software', 'web', 'app', 'mobile']),
      SkillAxis('Logic & Algorithms', ['algorithm', 'logic', 'data structure', 'competitive', 'icpc', 'math', 'discrete', 'optimization']),
      SkillAxis('System Architecture', ['architecture', 'system', 'cloud', 'aws', 'azure', 'devops', 'database', 'network', 'distributed', 'blockchain', 'infrastructure']),
      SkillAxis('Data & AI', ['data', 'machine learning', 'ai', 'artificial intelligence', 'neural', 'analytics', 'deep learning', 'nlp', 'vision']),
      SkillAxis('Collaboration', ['team', 'club', 'society', 'volunteer', 'lead', 'president', 'committee', 'community', 'mentor']),
    ], [76, 78, 74, 70, 72, 75], {
      'Computational Thinking': 'Computational Thinking',
      'Technical Engineering': 'System Architecture',
      'Leadership': 'Collaboration',
      'Teamwork': 'Collaboration',
      'Adaptability': 'Computational Thinking',
      'Conflict Resolution': 'Collaboration',
    }),
    FieldOfStudy('engineering', 'Engineering', [
      SkillAxis('Design & Prototyping', ['design', 'prototype', 'cad', 'solidworks', 'fabrication', '3d print', 'maker']),
      SkillAxis('Technical Analysis', ['analysis', 'simulation', 'matlab', 'calculation', 'modelling', 'modeling', 'testing']),
      SkillAxis('Systems Integration', ['robotics', 'iot', 'embedded', 'arduino', 'esp32', 'circuit', 'electronics', 'control', 'mechatronics']),
      SkillAxis('Project Management', ['project', 'management', 'planning', 'schedule', 'lead', 'coordinator', 'manager']),
      SkillAxis('Safety & Standards', ['safety', 'standard', 'iso', 'quality', 'compliance', 'osha', 'risk', 'ethics']),
      SkillAxis('Teamwork', ['team', 'club', 'society', 'volunteer', 'competition', 'community', 'committee']),
    ], [75, 74, 72, 70, 73, 77], {
      'Computational Thinking': 'Technical Analysis',
      'Technical Engineering': 'Systems Integration',
      'Leadership': 'Project Management',
      'Teamwork': 'Teamwork',
      'Adaptability': 'Design & Prototyping',
      'Conflict Resolution': 'Teamwork',
    }),
    FieldOfStudy('biology', 'Biology', [
      SkillAxis('Lab Research', ['lab', 'laboratory', 'research', 'pcr', 'microscopy', 'culture', 'assay', 'bench', 'wet lab']),
      SkillAxis('Data Analysis', ['data', 'analysis', 'statistics', 'bioinformatics', 'r programming', 'spss', 'genomics', 'sequencing']),
      SkillAxis('Scientific Method', ['scientific', 'experiment', 'hypothesis', 'methodology', 'thesis', 'symposium', 'publication', 'poster']),
      SkillAxis('Bioethics', ['ethics', 'bioethics', 'integrity', 'compliance', 'consent', 'policy', 'welfare']),
      SkillAxis('Field Work', ['field', 'ecology', 'conservation', 'expedition', 'marine', 'wildlife', 'sampling', 'environment']),
      SkillAxis('Science Communication', ['communication', 'presentation', 'outreach', 'writing', 'teaching', 'tutor', 'public', 'volunteer']),
    ], [76, 73, 75, 70, 68, 72], {
      'Computational Thinking': 'Data Analysis',
      'Technical Engineering': 'Lab Research',
      'Leadership': 'Science Communication',
      'Teamwork': 'Science Communication',
      'Adaptability': 'Field Work',
      'Conflict Resolution': 'Bioethics',
    }),
    FieldOfStudy('business', 'Business', [
      SkillAxis('Strategy', ['strategy', 'case competition', 'consulting', 'business plan', 'operations']),
      SkillAxis('Finance & Analytics', ['finance', 'accounting', 'investment', 'analytics', 'excel', 'valuation', 'trading', 'economics']),
      SkillAxis('Marketing', ['marketing', 'brand', 'social media', 'campaign', 'sales', 'digital', 'advertising']),
      SkillAxis('Entrepreneurship', ['startup', 'entrepreneur', 'pitch', 'venture', 'innovation', 'incubator', 'founder']),
      SkillAxis('Negotiation', ['negotiation', 'debate', 'mun', 'mediation', 'diplomacy', 'moot']),
      SkillAxis('Leadership', ['lead', 'president', 'director', 'chair', 'head', 'captain', 'manager', 'exco', 'committee']),
    ], [74, 72, 73, 70, 69, 77], {
      'Computational Thinking': 'Finance & Analytics',
      'Technical Engineering': 'Strategy',
      'Leadership': 'Leadership',
      'Teamwork': 'Leadership',
      'Adaptability': 'Entrepreneurship',
      'Conflict Resolution': 'Negotiation',
    }),
    FieldOfStudy('others', 'Others', [
      SkillAxis('Leadership', ['lead', 'president', 'director', 'chair', 'head', 'captain', 'founder', 'exco', 'secretary', 'treasurer']),
      SkillAxis('Communication', ['communication', 'presentation', 'writing', 'public speaking', 'media', 'journalism', 'debate']),
      SkillAxis('Problem Solving', ['problem', 'hackathon', 'challenge', 'competition', 'analysis', 'innovation', 'case']),
      SkillAxis('Adaptability', ['exchange', 'mobility', 'global', 'international', 'agile', 'bootcamp', 'adapt']),
      SkillAxis('Teamwork', ['team', 'club', 'society', 'volunteer', 'community', 'committee', 'outreach', 'charity']),
      SkillAxis('Critical Thinking', ['research', 'ethics', 'policy', 'critical', 'evaluation', 'reasoning', 'thesis']),
    ], [76, 75, 74, 72, 78, 71], {
      'Computational Thinking': 'Problem Solving',
      'Technical Engineering': 'Problem Solving',
      'Leadership': 'Leadership',
      'Teamwork': 'Teamwork',
      'Adaptability': 'Adaptability',
      'Conflict Resolution': 'Communication',
    }),
  ];

  static const _programHints = <String, List<String>>{
    'computer-science': ['computer', 'computing', 'software', 'information tech', r'it\b', 'data science', 'cyber', 'informatics'],
    'engineering': ['engineering', 'mechanical', 'electrical', 'civil', 'chemical eng', 'mechatronic'],
    'biology': ['biology', 'biotech', 'biomedical', 'life science', 'microbio', 'genetics', 'biochem'],
    'business': ['business', 'management', 'finance', 'accounting', 'marketing', 'economics', 'commerce', 'mba'],
  };

  static FieldOfStudy byId(String id) => fields.firstWhere((f) => f.id == id, orElse: () => fields.last);

  /// Accepts a field id, a label, or a free-text program name.
  static FieldOfStudy resolve(dynamic fieldOrProgram) {
    final q = (fieldOrProgram ?? '').toString().trim().toLowerCase();
    if (q.isEmpty) return byId(defaultFieldId);
    for (final f in fields) {
      if (f.id == q || f.label.toLowerCase() == q) return f;
    }
    for (final entry in _programHints.entries) {
      if (entry.value.any((w) => RegExp('\\b$w').hasMatch(q))) return byId(entry.key);
    }
    return byId(defaultFieldId);
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
