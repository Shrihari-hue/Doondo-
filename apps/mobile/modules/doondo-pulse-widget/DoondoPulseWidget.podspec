require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'DoondoPulseWidget'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license']
  s.author         = 'Doondo'
  s.homepage       = 'https://doondo.app'
  s.platform       = :ios, '14.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,swift}'
end
