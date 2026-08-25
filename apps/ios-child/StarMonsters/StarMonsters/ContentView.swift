//
//  ContentView.swift
//  StarMonsters
//
//  Static native task-list screen. Data and actions are intentionally local
//  until the native app API layer is introduced.
//

import SwiftUI

private enum TaskCategory: String, CaseIterable, Identifiable {
    case all = "全部"
    case chinese = "语文"
    case math = "数学"
    case english = "英语"
    case exercise = "运动"
    case life = "生活"

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .all: return AppColors.orange
        case .chinese: return Color(red: 0.82, green: 0.34, blue: 0.45)
        case .math: return Color(red: 0.48, green: 0.50, blue: 0.82)
        case .english: return Color(red: 0.25, green: 0.67, blue: 0.74)
        case .exercise: return Color(red: 0.94, green: 0.42, blue: 0.39)
        case .life: return Color(red: 0.89, green: 0.62, blue: 0.22)
        }
    }
}

private struct TaskItem: Identifiable {
    let id = UUID()
    let title: String
    let category: TaskCategory
    let duration: String
    let stars: Int
    let repeatable: Bool
    let icon: String
}

private enum AppColors {
    static let ink = Color(red: 0.14, green: 0.23, blue: 0.35)
    static let muted = Color(red: 0.40, green: 0.46, blue: 0.55)
    static let cream = Color(red: 1.0, green: 0.975, blue: 0.91)
    static let surface = Color(red: 1.0, green: 0.992, blue: 0.965)
    static let orange = Color(red: 1.0, green: 0.43, blue: 0.21)
    static let border = Color(red: 0.78, green: 0.82, blue: 0.87)
}

struct ContentView: View {
    @State private var selectedCategory: TaskCategory = .all
    @State private var completedTaskIDs = Set<UUID>()
    @State private var activeTaskID: UUID?
    @State private var selectedTab = "任务"

    private let tasks: [TaskItem] = [
        TaskItem(title: "汉字学习", category: .chinese, duration: "约 4 分钟", stars: 1, repeatable: false, icon: "character.book.closed.fill"),
        TaskItem(title: "学习新古诗", category: .chinese, duration: "约 8 分钟", stars: 1, repeatable: false, icon: "text.book.closed.fill"),
        TaskItem(title: "数学计算 20 题", category: .math, duration: "约 12 分钟", stars: 1, repeatable: true, icon: "plus.forwardslash.minus"),
        TaskItem(title: "凑十训练", category: .math, duration: "约 5 分钟", stars: 2, repeatable: true, icon: "number.circle.fill"),
        TaskItem(title: "2 本 RAZ 指读", category: .english, duration: "约 15 分钟", stars: 2, repeatable: true, icon: "book.fill"),
        TaskItem(title: "游泳训练", category: .exercise, duration: "约 30 分钟", stars: 2, repeatable: false, icon: "figure.pool.swim"),
        TaskItem(title: "收拾玩具", category: .life, duration: "约 8 分钟", stars: 1, repeatable: false, icon: "shippingbox.fill")
    ]

    private var visibleTasks: [TaskItem] {
        selectedCategory == .all ? tasks : tasks.filter { $0.category == selectedCategory }
    }

    var body: some View {
        ZStack {
            AppColors.cream.ignoresSafeArea()
            GeometryReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 22) {
                        header
                        categoryPicker
                        taskList
                    }
                    .frame(maxWidth: 1120)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, proxy.size.width >= 700 ? 34 : 18)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomNavigation }
        .preferredColorScheme(.light)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("今天的安排")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(AppColors.muted)

            HStack(alignment: .center, spacing: 16) {
                Text("我的任务")
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .foregroundStyle(AppColors.ink)
                Spacer(minLength: 12)
                HStack(spacing: 8) {
                    Image(systemName: "flame.fill")
                    Text("连续 4 天")
                }
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(AppColors.orange)
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .background(AppColors.surface, in: Capsule())
                .overlay(Capsule().stroke(AppColors.border, lineWidth: 2))
            }

            Text("完成今天的小任务，收集闪闪发光的星星")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(AppColors.muted)
        }
    }

    private var categoryPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(TaskCategory.allCases) { category in
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) { selectedCategory = category }
                    } label: {
                        Text(category.rawValue)
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundStyle(selectedCategory == category ? Color.white : AppColors.muted)
                            .padding(.horizontal, 19)
                            .padding(.vertical, 11)
                            .background(selectedCategory == category ? category.color : AppColors.surface, in: Capsule())
                            .overlay(Capsule().stroke(selectedCategory == category ? category.color : AppColors.border, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var taskList: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("待完成任务")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(AppColors.ink)
                Spacer()
                Text("\(completedTaskIDs.count)/\(tasks.count) 已完成")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.muted)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.72), in: Capsule())
            }

            LazyVStack(spacing: 12) {
                ForEach(visibleTasks) { task in
                    TaskRow(task: task, isCompleted: completedTaskIDs.contains(task.id), isActive: activeTaskID == task.id) {
                        handleTaskTap(task)
                    }
                }
            }
        }
        .padding(18)
        .background(AppColors.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(AppColors.border, lineWidth: 2))
    }

    private var bottomNavigation: some View {
        HStack(spacing: 8) {
            NavItem(title: "首页", icon: "house.fill", selected: selectedTab == "首页") { selectedTab = "首页" }
            NavItem(title: "任务", icon: "checklist", selected: selectedTab == "任务") { selectedTab = "任务" }
            NavItem(title: "星宠", icon: "star.fill", selected: selectedTab == "星宠") { selectedTab = "星宠" }
            NavItem(title: "足迹", icon: "figure.walk", selected: selectedTab == "足迹") { selectedTab = "足迹" }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.ultraThickMaterial)
        .overlay(alignment: .top) { Divider().overlay(AppColors.border) }
    }

    private func handleTaskTap(_ task: TaskItem) {
        if completedTaskIDs.contains(task.id) {
            completedTaskIDs.remove(task.id)
        } else if activeTaskID == task.id {
            completedTaskIDs.insert(task.id)
            activeTaskID = nil
        } else {
            activeTaskID = task.id
        }
    }
}

private struct TaskRow: View {
    let task: TaskItem
    let isCompleted: Bool
    let isActive: Bool
    let onStart: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(task.category.color)
                .frame(width: 7)

            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(task.category.color.opacity(0.14))
                Image(systemName: task.icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(task.category.color)
            }
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 6) {
                Text(task.title)
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(AppColors.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                HStack(spacing: 10) {
                    Label(task.duration, systemImage: "clock")
                    Label("+\(task.stars)", systemImage: "star.fill")
                        .foregroundStyle(Color(red: 0.92, green: 0.62, blue: 0.10))
                    if task.repeatable {
                        Text("可重复")
                            .foregroundStyle(AppColors.orange)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .overlay(Capsule().stroke(AppColors.orange, lineWidth: 1))
                    }
                }
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(AppColors.muted)
            }

            Spacer(minLength: 8)

            Button(action: onStart) {
                Text(isCompleted ? "已完成" : isActive ? "完成啦" : "开始")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(isCompleted ? AppColors.muted : Color.white)
                    .frame(minWidth: 76, minHeight: 44)
                    .background(isCompleted ? Color.white.opacity(0.72) : AppColors.orange, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(isCompleted ? AppColors.border : AppColors.orange, lineWidth: 2))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(minHeight: 88)
        .background(Color(red: 1.0, green: 0.975, blue: 0.90), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AppColors.border, lineWidth: 2))
        .opacity(isCompleted ? 0.72 : 1)
    }
}

private struct NavItem: View {
    let title: String
    let icon: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                Text(title)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
            }
            .foregroundStyle(selected ? AppColors.orange : AppColors.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(selected ? AppColors.orange.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
