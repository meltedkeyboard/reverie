Pod::Spec.new do |s|
  s.name           = 'ReverieCloudFolder'
  s.version        = '1.0.0'
  s.summary        = 'A folder picked in Files, kept across launches, with coordinated copies'
  s.description    = 'A folder picked in Files, kept across launches, with coordinated copies'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
