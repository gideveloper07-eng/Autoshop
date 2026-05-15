import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class ChallanScreen extends StatefulWidget {
  const ChallanScreen({super.key});

  @override
  State<ChallanScreen> createState() => _ChallanScreenState();
}

class _ChallanScreenState extends State<ChallanScreen>
    with SingleTickerProviderStateMixin {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  late AnimationController _animController;
  late Animation<double> _fadeAnim;

  // ── Theme colours ────────────────────────────────────────────────────────
  static const Color _primary   = Color(0xFF1A56DB);
  static const Color _secondary = Color(0xFF3B82F6);
  static const Color _accent    = Color(0xFF60A5FA);
  static const Color _bg        = Color(0xFFF0F4FF);
  static const Color _cardBg    = Colors.white;
  static const Color _textDark  = Color(0xFF1E293B);
  static const Color _textMid   = Color(0xFF64748B);

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _fadeAnim = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    );
    _loadData();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    _animController.reset();
    try {
      final data = await ApiService.getChallanRetailIncentive();
      setState(() {
        _rows = data;
        _loading = false;
      });
      _animController.forward();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  // ── Column definitions ───────────────────────────────────────────────────
  static const List<_ColDef> _columns = [
    _ColDef(key: 'date',   label: 'Date',       flex: 3),
    _ColDef(key: 'sp_468', label: 'Challan No', flex: 3),
    _ColDef(key: 'sp_469', label: 'Customer Name', flex: 5),
  ];

  String _cell(Map<String, dynamic> row, String key) {
    final v = row[key];
    if (v == null) return '-';
    final s = v.toString();
    if (key == 'date' && s.contains('T')) return s.split('T').first;
    return s;
  }

  // ── Edit action ──────────────────────────────────────────────────────────
  void _onEdit(Map<String, dynamic> row) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditSheet(row: row, onSaved: _loadData),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          _buildHeader(),
          Expanded(
            child: _loading
                ? _buildLoader()
                : _error != null
                    ? _buildError()
                    : _rows.isEmpty
                        ? _buildEmpty()
                        : _buildGrid(),
          ),
        ],
      ),
    );
  }

  // ── Header ───────────────────────────────────────────────────────────────
  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1A3A8F), _primary, _secondary],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x551A56DB),
            blurRadius: 20,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 10, 16, 18),
          child: Row(
            children: [
              // Back
              Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.arrow_back_ios_new_rounded,
                        color: Colors.white, size: 18),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Icon badge
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: Colors.white.withValues(alpha: 0.3), width: 1.5),
                ),
                child: const Icon(Icons.receipt_long_rounded,
                    color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              // Title
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Challan",
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: 0.4,
                      ),
                    ),
                    Text(
                      "Retail Incentive",
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white70,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
              // Refresh
              Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _loadData,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.3), width: 1.5),
                    ),
                    child: const Icon(Icons.refresh_rounded,
                        color: Colors.white, size: 20),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Loader ───────────────────────────────────────────────────────────────
  Widget _buildLoader() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 52,
            height: 52,
            child: CircularProgressIndicator(
              strokeWidth: 3.5,
              color: _primary,
              backgroundColor: _accent.withValues(alpha: 0.2),
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            "Loading challans…",
            style: TextStyle(
              fontSize: 14,
              color: _textMid,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFFFFEBEE),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.error_outline_rounded,
                  size: 44, color: Color(0xFFE53935)),
            ),
            const SizedBox(height: 20),
            const Text(
              "Failed to load challans",
              style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: _textDark),
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: _textMid),
            ),
            const SizedBox(height: 28),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text("Retry"),
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                    horizontal: 28, vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(28),
            ),
            child: const Icon(Icons.inbox_rounded,
                size: 50, color: _accent),
          ),
          const SizedBox(height: 20),
          const Text(
            "No challans found",
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: _textMid),
          ),
          const SizedBox(height: 6),
          const Text(
            "Pull to refresh or check back later",
            style: TextStyle(fontSize: 12, color: Color(0xFFB0BEC5)),
          ),
        ],
      ),
    );
  }

  // ── Data grid ────────────────────────────────────────────────────────────
  Widget _buildGrid() {
    return FadeTransition(
      opacity: _fadeAnim,
      child: Column(
        children: [
          // ── Stats bar ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                _StatChip(
                  icon: Icons.receipt_long_rounded,
                  label: "${_rows.length} Record${_rows.length == 1 ? '' : 's'}",
                  color: _primary,
                ),
                const Spacer(),
                _StatChip(
                  icon: Icons.calendar_today_rounded,
                  label: "Retail Incentive",
                  color: const Color(0xFF0891B2),
                ),
              ],
            ),
          ),

          // ── Table ──────────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                decoration: BoxDecoration(
                  color: _cardBg,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: _primary.withValues(alpha: 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    // Header row
                    _buildTableHeader(),
                    // Data rows
                    Expanded(child: _buildTableRows()),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1A3A8F), _primary],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
      ),
      child: Row(
        children: [
          ..._columns.map(
            (col) => Expanded(
              flex: col.flex,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 13),
                child: Text(
                  col.label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ),
          ),
          // Edit column header
          const SizedBox(
            width: 72,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 8, vertical: 13),
              child: Text(
                "Action",
                style: TextStyle(
                  color: Colors.white70,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                  letterSpacing: 0.4,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableRows() {
    return ListView.separated(
      itemCount: _rows.length,
      separatorBuilder: (_, __) => const Divider(
        height: 1,
        thickness: 1,
        color: Color(0xFFEFF2FF),
      ),
      itemBuilder: (context, index) {
        final row = _rows[index];
        final isEven = index % 2 == 0;
        return _DataRow(
          row: row,
          columns: _columns,
          isEven: isEven,
          cellFn: _cell,
          onEdit: () => _onEdit(row),
        );
      },
    );
  }
}

// ── Reusable stat chip ────────────────────────────────────────────────────────
class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _StatChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Data row widget ───────────────────────────────────────────────────────────
class _DataRow extends StatelessWidget {
  final Map<String, dynamic> row;
  final List<_ColDef> columns;
  final bool isEven;
  final String Function(Map<String, dynamic>, String) cellFn;
  final VoidCallback onEdit;

  const _DataRow({
    required this.row,
    required this.columns,
    required this.isEven,
    required this.cellFn,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isEven ? Colors.white : const Color(0xFFF5F8FF),
      child: Row(
        children: [
          ...columns.map((col) {
            final value = cellFn(row, col.key);
            final isChallanNo = col.key == 'sp_468';
            return Expanded(
              flex: col.flex,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 12),
                child: isChallanNo
                    ? Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A56DB).withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          value,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF1A56DB),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      )
                    : Text(
                        value,
                        style: TextStyle(
                          fontSize: 12,
                          color: col.key == 'date'
                              ? const Color(0xFF475569)
                              : const Color(0xFF1E293B),
                          fontWeight: col.key == 'date'
                              ? FontWeight.w500
                              : FontWeight.normal,
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 2,
                      ),
              ),
            );
          }),
          // Edit button
          SizedBox(
            width: 72,
            child: Center(
              child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF1A56DB), Color(0xFF3B82F6)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF1A56DB).withValues(alpha: 0.3),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.edit_rounded,
                          size: 12, color: Colors.white),
                      SizedBox(width: 4),
                      Text(
                        "Edit",
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Edit bottom sheet ─────────────────────────────────────────────────────────
class _EditSheet extends StatefulWidget {
  final Map<String, dynamic> row;
  final VoidCallback onSaved;

  const _EditSheet({required this.row, required this.onSaved});

  @override
  State<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends State<_EditSheet> {
  late TextEditingController _dateCtrl;
  late TextEditingController _challanCtrl;
  late TextEditingController _partyCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    String dateVal = widget.row['date']?.toString() ?? '';
    if (dateVal.contains('T')) dateVal = dateVal.split('T').first;
    _dateCtrl    = TextEditingController(text: dateVal);
    _challanCtrl = TextEditingController(
        text: widget.row['sp_468']?.toString() ?? '');
    _partyCtrl   = TextEditingController(
        text: widget.row['sp_469']?.toString() ?? '');
  }

  @override
  void dispose() {
    _dateCtrl.dispose();
    _challanCtrl.dispose();
    _partyCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    // TODO: wire up to your update API endpoint
    await Future.delayed(const Duration(milliseconds: 800));
    if (mounted) {
      setState(() => _saving = false);
      Navigator.pop(context);
      widget.onSaved();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.check_circle_rounded,
                  color: Colors.white, size: 18),
              SizedBox(width: 10),
              Text("Challan updated successfully"),
            ],
          ),
          backgroundColor: const Color(0xFF1A56DB),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.all(16),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: EdgeInsets.fromLTRB(20, 24, 20, 20 + bottom),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 30,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFE2E8F0),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Title
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1A3A8F), Color(0xFF1A56DB)],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.edit_rounded,
                    color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Edit Challan",
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                  Text(
                    "Update challan details",
                    style: TextStyle(
                        fontSize: 12, color: Color(0xFF94A3B8)),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 24),
          // Fields
          _SheetField(
            controller: _dateCtrl,
            label: "Date",
            icon: Icons.calendar_today_rounded,
          ),
          const SizedBox(height: 14),
          _SheetField(
            controller: _challanCtrl,
            label: "Challan No",
            icon: Icons.tag_rounded,
          ),
          const SizedBox(height: 14),
          _SheetField(
            controller: _partyCtrl,
            label: "Customer Name",
            icon: Icons.person_rounded,
          ),
          const SizedBox(height: 28),
          // Buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF64748B),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text("Cancel",
                      style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1A56DB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.save_rounded, size: 16),
                            SizedBox(width: 8),
                            Text("Save Changes",
                                style: TextStyle(
                                    fontWeight: FontWeight.w700)),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Sheet text field ──────────────────────────────────────────────────────────
class _SheetField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;

  const _SheetField({
    required this.controller,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      style: const TextStyle(
          fontSize: 14,
          color: Color(0xFF1E293B),
          fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(
            fontSize: 13, color: Color(0xFF94A3B8)),
        prefixIcon: Icon(icon, size: 18, color: const Color(0xFF1A56DB)),
        filled: true,
        fillColor: const Color(0xFFF8FAFF),
        contentPadding: const EdgeInsets.symmetric(
            horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:
              const BorderSide(color: Color(0xFF1A56DB), width: 1.5),
        ),
      ),
    );
  }
}

// ── Column definition ─────────────────────────────────────────────────────────
class _ColDef {
  final String key;
  final String label;
  final int flex;
  const _ColDef({required this.key, required this.label, required this.flex});
}
