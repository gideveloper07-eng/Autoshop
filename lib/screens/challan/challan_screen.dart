import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../l10n/app_localizations.dart';
import 'challan_edit_details_screen.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

class ChallanScreen extends StatefulWidget {
  const ChallanScreen({super.key});

  @override
  State<ChallanScreen> createState() => _ChallanScreenState();
}

class _ChallanScreenState extends State<ChallanScreen>
    with SingleTickerProviderStateMixin {
  static const Map<String, Map<String, String>> _uiText = {
    'en': {
      'searchHint': 'Search customer, challan no...',
      'invalidChallanId': 'Invalid challan ID. Available fields:',
    },
    'ar': {
      'searchHint': 'بحث العملاء، تشالان لا...',
      'invalidChallanId': 'معرف تشالان غير صالح. الحقول المتاحة:',
    },
    'as': {
      'searchHint': 'গ্ৰাহক অনুসন্ধান, challan নং...',
      'invalidChallanId': 'অবৈধ challan আইডি। উপলব্ধ ক্ষেত্ৰসমূহ:',
    },
    'bn': {
      'searchHint': 'গ্রাহক অনুসন্ধান করুন, চালান নম্বর...',
      'invalidChallanId': 'অবৈধ চালান আইডি। উপলব্ধ ক্ষেত্র:',
    },
    'de': {
      'searchHint': 'Suche Kunde, Challan Nr...',
      'invalidChallanId': 'Ungültige Challan-ID. Verfügbare Felder:',
    },
    'es': {
      'searchHint': 'Buscar cliente, challan no...',
      'invalidChallanId': 'ID de Challan no válido. Campos disponibles:',
    },
    'fr': {
      'searchHint': 'Rechercher un client, Challan non...',
      'invalidChallanId': 'ID de Challan invalide. Champs disponibles :',
    },
    'gu': {
      'searchHint': 'ગ્રાહક શોધો, ચલણ નંબર...',
      'invalidChallanId': 'અમાન્ય ચલણ ID. ઉપલબ્ધ ક્ષેત્રો:',
    },
    'hi': {
      'searchHint': 'ग्राहक खोजें, चालान नंबर...',
      'invalidChallanId': 'अमान्य चालान आईडी. उपलब्ध फ़ील्ड:',
    },
    'id': {
      'searchHint': 'Cari pelanggan, challan no...',
      'invalidChallanId': 'ID tantangan tidak valid. Bidang yang tersedia:',
    },
    'it': {
      'searchHint': 'Cerca cliente, sfida no...',
      'invalidChallanId': 'ID sfida non valido. Campi disponibili:',
    },
    'ja': {
      'searchHint': '顧客を検索、チャランいいえ...',
      'invalidChallanId': '無効なチャランIDです。利用可能なフィールド:',
    },
    'kn': {
      'searchHint': 'ಗ್ರಾಹಕರನ್ನು ಹುಡುಕಿ, ಚಲನ್ ಸಂಖ್ಯೆ...',
      'invalidChallanId': 'ಅಮಾನ್ಯವಾದ ಚಲನ್ ಐಡಿ. ಲಭ್ಯವಿರುವ ಕ್ಷೇತ್ರಗಳು:',
    },
    'ml': {
      'searchHint': 'ഉപഭോക്താവിനെ തിരയുക, ചലാൻ നമ്പർ...',
      'invalidChallanId': 'അസാധുവായ ചലാൻ ഐഡി. ലഭ്യമായ ഫീൽഡുകൾ:',
    },
    'mr': {
      'searchHint': 'ग्राहक शोधा, चलन क्रमांक...',
      'invalidChallanId': 'अवैध चालान आयडी. उपलब्ध फील्ड:',
    },
    'nl': {
      'searchHint': 'Zoek klant, challan nee...',
      'invalidChallanId': 'Ongeldige challan-ID. Beschikbare velden:',
    },
    'or': {
      'searchHint': 'ଗ୍ରାହକ ଖୋଜ, ଚ୍ୟାଲେନ୍ ନା ...',
      'invalidChallanId': 'ଅବ val ଧ ଚ୍ୟାଲେନ୍ ID | ଉପଲବ୍ଧ କ୍ଷେତ୍ରଗୁଡିକ:',
    },
    'pa': {
      'searchHint': 'ਗਾਹਕ ਖੋਜੋ, ਚਲਾਨ ਨੰਬਰ...',
      'invalidChallanId': 'ਅਵੈਧ ਚਲਾਨ ID। ਉਪਲਬਧ ਖੇਤਰ:',
    },
    'pl': {
      'searchHint': 'Szukaj klienta, wyzwanie nie...',
      'invalidChallanId':
          'Nieprawidłowy identyfikator challana. Dostępne pola:',
    },
    'pt': {
      'searchHint': 'Pesquisa cliente, desafio não...',
      'invalidChallanId': 'ID do desafio inválido. Campos disponíveis:',
    },
    'ru': {
      'searchHint': 'Поиск клиента, чалан нет...',
      'invalidChallanId': 'Неверный идентификатор чалана. Доступные поля:',
    },
    'ta': {
      'searchHint': 'வாடிக்கையாளரைத் தேடுங்கள், சலான் எண்...',
      'invalidChallanId': 'செல்லாத சலான் ஐடி. கிடைக்கும் புலங்கள்:',
    },
    'te': {
      'searchHint': 'వినియోగదారుని శోధించండి, చలాన్ సంఖ్య...',
      'invalidChallanId': 'చెల్లని చలాన్ ID. అందుబాటులో ఉన్న ఫీల్డ్‌లు:',
    },
    'th': {
      'searchHint': 'ค้นหาลูกค้า chalan no...',
      'invalidChallanId': 'ID Challan ไม่ถูกต้อง ฟิลด์ที่มี:',
    },
    'tr': {
      'searchHint': 'Müşteriyi ara, Challan hayır...',
      'invalidChallanId': 'Geçersiz challan kimliği. Mevcut alanlar:',
    },
    'ur': {
      'searchHint': 'کسٹمر تلاش کریں، چالان نمبر...',
      'invalidChallanId': 'غلط چالان ID۔ دستیاب فیلڈز:',
    },
    'vi': {
      'searchHint': 'Tìm kiếm khách hàng, challan no...',
      'invalidChallanId': 'ID challan không hợp lệ. Các trường có sẵn:',
    },
    'zh': {'searchHint': '搜索客户，查兰没有...', 'invalidChallanId': '查兰 ID 无效。可用字段：'},
  };

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  late stt.SpeechToText _speech;

  bool _isListening = false;

  final TextEditingController _searchController = TextEditingController();

  List<Map<String, dynamic>> _filteredRows = [];
  late AnimationController _animController;
  late Animation<double> _fadeAnim;

  // Date filter: 'challan' for Challan Date, 'expected' for Expected Delivery Date
  String _dateFilter = 'challan';

  static const Color _primary = Color(0xFF1A56DB);
  static const Color _secondary = Color(0xFF3B82F6);
  static const Color _accent = Color(0xFF60A5FA);
  static const Color _bg = Color(0xFFF0F4FF);
  static const Color _cardBg = Colors.white;
  static const Color _textDark = Color(0xFF1E293B);
  static const Color _textMid = Color(0xFF64748B);
  static const Color _gridBorder = Color(0xFFC7D2FE);
  static const Color _gridHeaderBorder = Color(0xFF93C5FD);

  List<_ColDef> _columns(AppLocalizations l10n) {
    return [
      _ColDef(
        key: _dateFilter == 'challan' ? 'date' : 'exdate',
        label: _dateFilter == 'challan'
            ? l10n.challanDate
            : l10n.expectedDeliveryDate,
        flex: 3,
      ),
      _ColDef(key: 'sp_468', label: l10n.challanNo, flex: 3),
      _ColDef(key: 'sp_463', label: l10n.customerName, flex: 5),
    ];
  }

  String _t(String key) {
    final code = Localizations.localeOf(context).languageCode;
    return _uiText[code]?[key] ?? _uiText['en']![key] ?? key;
  }

  @override
  void initState() {
    super.initState();
    _speech = stt.SpeechToText();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);

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
      // Pass dateType parameter based on current filter
      final data = await ApiService.getChallanRetailIncentive(
        dateType: _dateFilter,
      );

      setState(() {
        _rows = List<Map<String, dynamic>>.from(data);

        // IMPORTANT
        _filteredRows = List<Map<String, dynamic>>.from(data);

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

  String _cell(Map<String, dynamic> row, String key) {
    final value = row[key];

    if (value == null) {
      return '-';
    }

    String text = value.toString();

    if ((key == 'date' || key == 'exdate') && text.contains('T')) {
      text = text.split('T').first;
    }

    return text;
  }

  void _filterSearch(String query) {
    if (query.trim().isEmpty) {
      setState(() {
        _filteredRows = _rows;
      });
      return;
    }

    final q = query.toLowerCase();

    setState(() {
      _filteredRows = _rows.where((row) {
        return row['sp_469'].toString().toLowerCase().contains(q) ||
            row['sp_468'].toString().toLowerCase().contains(q) ||
            row['date'].toString().toLowerCase().contains(q) ||
            row['exdate'].toString().toLowerCase().contains(q);
      }).toList();
    });
  }

  void _onEdit(Map<String, dynamic> row) async {
    print("🔍 Edit clicked for row: $row");

    final sp462 = row['sp_462']?.toString() ?? '';
    final challanNo = row['sp_468']?.toString() ?? '';

    print("📋 sp_462: '$sp462', challanNo: '$challanNo'");

    if (sp462.isEmpty) {
      print("❌ sp_462 is empty! Available keys: ${row.keys.toList()}");
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFFE53935),
          behavior: SnackBarBehavior.floating,
          content: Text(
            "${_t('invalidChallanId')} ${row.keys.take(5).join(', ')}",
          ),
          duration: const Duration(seconds: 5),
        ),
      );
      return;
    }

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            ChallanEditDetailsScreen(sp462: sp462, challanNo: challanNo),
      ),
    );

    // Refresh the list if challan was approved/rejected
    if (result == true) {
      _loadData();
    }
  }

  Future<void> _startListening() async {
    try {
      bool available = await _speech.initialize(
        onStatus: (status) {
          print("Speech Status: $status");

          if (status == 'done') {
            setState(() {
              _isListening = false;
            });
          }
        },
        onError: (error) {
          print("Speech Error: $error");

          setState(() {
            _isListening = false;
          });
        },
      );

      if (available) {
        setState(() {
          _isListening = true;
        });

        _speech.listen(
          listenMode: stt.ListenMode.confirmation,
          onResult: (result) {
            setState(() {
              _searchController.text = result.recognizedWords;
            });

            _filterSearch(result.recognizedWords);
          },
        );
      } else {
        print("Speech recognition unavailable");
      }
    } catch (e) {
      print("Speech exception: $e");
    }
  }

  Future<void> _stopListening() async {
    await _speech.stop();

    setState(() {
      _isListening = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          _buildHeader(l10n),
          Expanded(
            child: _loading
                ? _buildLoader(l10n)
                : _error != null
                ? _buildError(l10n)
                : _rows.isEmpty
                ? _buildEmpty(l10n)
                : _buildGrid(l10n),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(AppLocalizations l10n) {
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
                    child: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.3),
                    width: 1.5,
                  ),
                ),
                child: const Icon(
                  Icons.receipt_long_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.challan,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: 0.4,
                      ),
                    ),
                    Text(
                      l10n.pendingChallan,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.white70,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
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
                        color: Colors.white.withValues(alpha: 0.3),
                        width: 1.5,
                      ),
                    ),
                    child: const Icon(
                      Icons.refresh_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLoader(AppLocalizations l10n) {
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
          Text(
            l10n.loadingChallans,
            style: const TextStyle(
              fontSize: 14,
              color: _textMid,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildError(AppLocalizations l10n) {
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
              child: const Icon(
                Icons.error_outline_rounded,
                size: 44,
                color: Color(0xFFE53935),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              l10n.failedToLoadChallans,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: _textMid),
            ),
            const SizedBox(height: 28),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text(l10n.retry),
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(AppLocalizations l10n) {
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
            child: const Icon(Icons.inbox_rounded, size: 50, color: _accent),
          ),
          const SizedBox(height: 20),
          Text(
            l10n.noChallansFound,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: _textMid,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGrid(AppLocalizations l10n) {
    return FadeTransition(
      opacity: _fadeAnim,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                _StatChip(
                  icon: Icons.receipt_long_rounded,
                  label: l10n.records(
                    _rows.length,
                    _rows.length == 1 ? '' : 's',
                  ),
                  color: _primary,
                ),
                const Spacer(),
                _StatChip(
                  icon: Icons.calendar_today_rounded,
                  label: l10n.pendingChallan,
                  color: const Color(0xFF0891B2),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(30),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  const SizedBox(width: 14),

                  const Icon(Icons.search, color: Color(0xFF64748B)),

                  const SizedBox(width: 10),

                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      onChanged: _filterSearch,
                      decoration: InputDecoration(
                        hintText: _t('searchHint'),
                        border: InputBorder.none,
                      ),
                    ),
                  ),

                  GestureDetector(
                    onTap: () async {
                      if (_isListening) {
                        await _stopListening();
                      } else {
                        await _startListening();
                      }
                    },
                    child: Container(
                      margin: const EdgeInsets.only(right: 8),
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: _isListening
                            ? Colors.red
                            : const Color(0xFF1A56DB),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        _isListening ? Icons.mic : Icons.mic_none,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ── Date Filter Section ────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _cardBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _gridBorder, width: 1),
                boxShadow: [
                  BoxShadow(
                    color: _primary.withValues(alpha: 0.06),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.filter_list_rounded,
                    size: 18,
                    color: _textMid,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.showDate,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: _textMid,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Row(
                      children: [
                        _FilterChip(
                          label: l10n.challanDate,
                          isSelected: _dateFilter == 'challan',
                          onTap: () {
                            if (_dateFilter != 'challan') {
                              setState(() {
                                _dateFilter = 'challan';
                              });
                              _loadData(); // Reload data with new filter
                            }
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: l10n.expectedDelivery,
                          isSelected: _dateFilter == 'expected',
                          onTap: () {
                            if (_dateFilter != 'expected') {
                              setState(() {
                                _dateFilter = 'expected';
                              });
                              _loadData(); // Reload data with new filter
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                decoration: BoxDecoration(
                  color: _cardBg,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: _gridBorder, width: 1.2),
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
                    _buildTableHeader(l10n),
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

  Widget _buildTableHeader(AppLocalizations l10n) {
    final columns = _columns(l10n);
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF1A3A8F), _primary]),
        border: Border(bottom: BorderSide(color: _gridBorder, width: 1.2)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < columns.length; i++)
            Expanded(
              flex: columns[i].flex,
              child: Container(
                decoration: const BoxDecoration(
                  border: Border(
                    right: BorderSide(color: _gridHeaderBorder, width: 1),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 13,
                  ),
                  child: Text(
                    columns[i].label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ),
          SizedBox(
            width: 112,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 13),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  l10n.action,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableRows() {
    final l10n = AppLocalizations.of(context)!;
    final columns = _columns(l10n);

    return ListView.separated(
      itemCount: _filteredRows.length,
      separatorBuilder: (_, __) {
        return const Divider(height: 1, thickness: 1, color: _gridBorder);
      },
      itemBuilder: (context, index) {
        final row = _filteredRows[index];

        return _DataRow(
          row: row,
          columns: columns,
          isEven: index % 2 == 0,
          cellFn: _cell,
          onEdit: () => _onEdit(row),
          editLabel: l10n.edit,
        );
      },
    );
  }
}

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

class _DataRow extends StatelessWidget {
  static const Color _borderColor = Color(0xFFC7D2FE);
  static const Color _evenRowColor = Colors.white;
  static const Color _oddRowColor = Color(0xFFEAF1FF);

  final Map<String, dynamic> row;
  final List<_ColDef> columns;
  final bool isEven;
  final String Function(Map<String, dynamic>, String) cellFn;
  final VoidCallback onEdit;
  final String editLabel;

  const _DataRow({
    required this.row,
    required this.columns,
    required this.isEven,
    required this.cellFn,
    required this.onEdit,
    required this.editLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isEven ? _evenRowColor : _oddRowColor,
      child: Row(
        children: [
          ...columns.map((col) {
            final value = cellFn(row, col.key);
            final isChallanNo = col.key == 'sp_468';

            return Expanded(
              flex: col.flex,
              child: Container(
                decoration: const BoxDecoration(
                  border: Border(
                    right: BorderSide(color: _borderColor, width: 1),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 12,
                  ),
                  child: isChallanNo
                      ? Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFF1A56DB,
                            ).withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: const Color(0xFFBFDBFE)),
                          ),
                          child: Text(
                            value,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF1A56DB),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        )
                      : Text(
                          value,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 2,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight:
                                (col.key == 'date' || col.key == 'exdate')
                                ? FontWeight.w600
                                : FontWeight.w700,
                            color: (col.key == 'date' || col.key == 'exdate')
                                ? const Color(0xFF475569)
                                : const Color(0xFF1E293B),
                          ),
                        ),
                ),
              ),
            );
          }),
          SizedBox(
            width: 112,
            child: Container(
              decoration: const BoxDecoration(
                border: Border(
                  right: BorderSide(color: _borderColor, width: 1),
                ),
              ),
              child: Center(
                child: GestureDetector(
                  onTap: onEdit,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF1A56DB), Color(0xFF3B82F6)],
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
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.edit_rounded,
                            size: 12,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            editLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
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
            ),
          ),
        ],
      ),
    );
  }
}

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

    if (dateVal.contains('T')) {
      dateVal = dateVal.split('T').first;
    }

    _dateCtrl = TextEditingController(text: dateVal);

    _challanCtrl = TextEditingController(
      text: widget.row['sp_468']?.toString() ?? '',
    );

    _partyCtrl = TextEditingController(
      text: widget.row['sp_469']?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _dateCtrl.dispose();
    _challanCtrl.dispose();
    _partyCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
    });

    await Future.delayed(const Duration(milliseconds: 800));

    if (!mounted) return;

    setState(() {
      _saving = false;
    });

    Navigator.pop(context);

    widget.onSaved();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A56DB),
        behavior: SnackBarBehavior.floating,
        content: const Text("Challan updated successfully"),
      ),
    );
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
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
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
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  child: const Text("Cancel"),
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
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text("Save Changes"),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

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
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: const Color(0xFF1A56DB)),
        filled: true,
        fillColor: const Color(0xFFF8FAFF),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          gradient: isSelected
              ? const LinearGradient(
                  colors: [Color(0xFF1A56DB), Color(0xFF3B82F6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
          color: isSelected ? null : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF1A56DB)
                : const Color(0xFFE2E8F0),
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? Colors.white : const Color(0xFF64748B),
          ),
        ),
      ),
    );
  }
}

class _ColDef {
  final String key;
  final String label;
  final int flex;

  const _ColDef({required this.key, required this.label, required this.flex});
}
