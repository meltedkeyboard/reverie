Pod::Spec.new do |s|
  s.name           = 'ReverieDrag'
  s.version        = '1.0.0'
  s.summary        = 'System drag and drop of the character cards'
  s.description    = 'System drag and drop of the character cards'
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
