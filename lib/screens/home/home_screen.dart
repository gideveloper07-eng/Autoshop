import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../auth/login_screen.dart';

class HomeScreen extends StatefulWidget {
  final String userName;
  final String userEmail;
  const HomeScreen({super.key, this.userName = "Student", this.userEmail = ""});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
Future<void> _logout() async {

  final confirm = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      title: const Text(
        "Logout",
        style: TextStyle(fontWeight: FontWeight.bold),
      ),
      content: const Text(
        "Are you sure you want to logout?",
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text("Cancel"),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF8B1E3F),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: const Text("Logout"),
        ),
      ],
    ),
  );

  if (confirm == true) {

    try {

      // GET TOKEN
      final token = await ApiService.getToken();

      // CALL LOGOUT API
      await ApiService.logout(token ?? "");

    } catch (e) {
      print("LOGOUT ERROR: $e");
    }

    // CLEAR LOCAL SESSION
    await ApiService.clearSession();

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
      (_) => false,
    );
  }
}

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      body: Column(
        children: [
          // ── HEADER ────────────────────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF5C1229), Color(0xFF8B1E3F), Color(0xFFAB2550)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: Color(0x448B1E3F),
                  blurRadius: 16,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.directions_car_rounded,
                            color: Colors.white, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text(
                          "MyAutoShop",
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: 1,
                          ),
                        ),
                        Text(
                          "Your trusted auto service",
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.75),
                            fontSize: 11,
                          ),
                        ),
                      ]),
                    ]),
                    GestureDetector(
                      onTap: _logout,
                      child: Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.white.withOpacity(0.35)),
                        ),
                        child: const Icon(Icons.logout_rounded,
                            color: Colors.white, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── BODY ──────────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome row
                  Row(children: [
                    const Text("👋 ", style: TextStyle(fontSize: 22)),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(fontSize: 18, color: Color(0xFF1A1A2E)),
                        children: [
                          const TextSpan(text: "Welcome, "),
                          TextSpan(
                            text: widget.userName.split(' ').first,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF8B1E3F),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    "What would you like to do today?",
                    style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
                  ),
                  const SizedBox(height: 24),

                  // ── DASHBOARD CARDS ───────────────────────────────────
                  Row(children: [
                    Expanded(child: _dashCard(
                      icon: Icons.receipt_long_rounded,
                      label: "Challan",
                      subtitle: "View & manage challans",
                      gradient: [const Color(0xFF1565C0), const Color(0xFF1E88E5)],
                      accentColor: const Color(0xFF82B1FF),
                      onTap: () {},
                    )),
                    const SizedBox(width: 14),
                    Expanded(child: _dashCard(
                      icon: Icons.badge_rounded,
                      label: "Gate Pass",
                      subtitle: "Issue & track gate passes",
                      gradient: [const Color(0xFF00695C), const Color(0xFF00ACC1)],
                      accentColor: const Color(0xFF80DEEA),
                      onTap: () {},
                    )),
                  ]),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(child: _dashCard(
                      icon: Icons.request_page_rounded,
                      label: "Receipt",
                      subtitle: "Payment receipts",
                      gradient: [const Color(0xFF6A1B9A), const Color(0xFFAB47BC)],
                      accentColor: const Color(0xFFCE93D8),
                      onTap: () {},
                    )),
                    const SizedBox(width: 14),
                    Expanded(child: _dashCard(
                      icon: Icons.calendar_month_rounded,
                      label: "Booking",
                      subtitle: "Schedule a service",
                      gradient: [const Color(0xFFE65100), const Color(0xFFFF8F00)],
                      accentColor: const Color(0xFFFFCC80),
                      onTap: () {},
                    )),
                  ]),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dashCard({
    required IconData icon,
    required String label,
    required String subtitle,
    required List<Color> gradient,
    required Color accentColor,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: gradient[0].withOpacity(0.4),
              blurRadius: 18,
              offset: const Offset(0, 7),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              // Icon bubble
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: Colors.white, size: 26),
              ),
              // Arrow chip
              Container(
                width: 28, height: 28,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.arrow_forward_ios_rounded,
                    size: 13, color: Colors.white),
              ),
            ]),
            const SizedBox(height: 18),
            Text(
              label,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withOpacity(0.78),
                height: 1.3,
              ),
            ),
            const SizedBox(height: 14),
            // Bottom accent bar
            Container(
              height: 3,
              decoration: BoxDecoration(
                color: accentColor.withOpacity(0.6),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
